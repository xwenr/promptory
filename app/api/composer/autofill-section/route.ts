import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callAI } from '@/lib/insight';
import { splitCombinedValue, MULTI_VALUE_JOINER } from '@/lib/composer';

interface AutofillFieldInput {
  id: string;
  label: string;
  /** 人话标题 (optional) */
  friendlyLabel?: string;
  placeholder: string;
  description?: string;
  friendlyHint?: string;
  type: 'input' | 'textarea';
  multi?: boolean;
  /** 现有 tag，AI 可以选中或补充 */
  existingOptions: string[];
}

interface AutofillRequest {
  scene?: string;
  cluster?: string;
  templateBody?: string;
  sectionId: string;
  sectionTitle: string;
  sectionDimensions?: string[];
  userDescription: string;
  fields: AutofillFieldInput[];
}

interface AutofillFieldOutput {
  /** 字段 id，与请求一一对应 */
  id: string;
  /** 最终要写入字段的 value；multi 字段会用 " + " 连接 */
  value: string;
  /** 对于 multi 字段，列出所挑选/新增的 tag；single 字段可省略 */
  tags?: string[];
}

function buildAutofillPrompt(req: AutofillRequest): string {
  const sceneLine = req.cluster
    ? `目标场景：「${req.scene || '通用'} · ${req.cluster}」`
    : `目标场景：通用`;

  const ctxLine = req.templateBody
    ? `模板全文（用于理解上下文，不要照抄）：\n${req.templateBody.slice(0, 1000)}\n`
    : '';

  const dims =
    req.sectionDimensions && req.sectionDimensions.length > 0
      ? `这个 section 要描述的维度：${req.sectionDimensions.join(' / ')}`
      : '';

  const fieldSpecs = req.fields
    .map((f, i) => {
      const human = f.friendlyLabel ? ` (${f.friendlyLabel})` : '';
      const hint = f.friendlyHint ? ` — ${f.friendlyHint}` : '';
      const existing =
        f.existingOptions.length > 0
          ? `当前已有 tag: ${f.existingOptions.map((o) => `"${o}"`).join('、')}`
          : '当前没有 tag';
      const mode = f.multi
        ? '多选 (multi): 返回若干 tag，放到 tags 数组里；value 用 " + " 把 tag 连起来'
        : f.type === 'textarea'
          ? '单值长文本 (textarea): 返回一段自然语言 / 技术描述到 value'
          : '单值短文本 (input): 返回一个短值到 value';
      return `### 字段 ${i + 1} / id=${f.id}
- 技术名: ${f.label}${human}
- 占位符: [${f.placeholder}]
- 类型: ${mode}${hint}
- ${existing}`;
    })
    .join('\n\n');

  return `你是 vibe coding 翻译官。用户用大白话描述了想要的效果，你的工作是把这段描述**精准拆解**到这个 section 下的每一个字段里，并转换成 Cursor/Copilot 等 AI coding 工具能**直接理解并准确实现**的表达。

${sceneLine}
${ctxLine}
## 当前 section
${req.sectionTitle}
${dims}

## 用户的人话描述
"""
${req.userDescription}
"""

## 要填的字段
${fieldSpecs}

## 填充规则（硬性要求）

1. 不要凭空编造用户没提到的内容；如果某个字段在用户描述里完全没覆盖，就把 value 设为空字符串（multi 就返回空 tags 数组）。
2. 对于 multi 字段：
   - 每个 tag 必须是**原子 tag**，长度中文 ≤ 8 字 / 英文 ≤ 3 词。
   - 禁止一个 tag 里塞多个属性（"dark, moody"、"React + Vite" 都不行）。
   - 如果用户描述里已经出现了某个"当前已有 tag"，也把它加到 tags 数组里（表示选中它）。
   - value 字段 = tags.join(" ${MULTI_VALUE_JOINER.trim()} ")，前后带空格，例："dark + moody + cinematic"。
3. 对于 textarea 字段：把用户相关描述转为技术语言，例如把"深色科幻感"翻译成"dark cinematic theme with subtle neon accents"；可以用英文技术术语以提高实现准确度。
4. 对于 input 字段：填短值，如品牌名、URL、色值、类型名等；不要写整句。
5. 不要把同一条描述重复填到多个字段里；按维度精准分配。
6. 如果用户描述了 section 外的内容（比如用户在 design section 里提到了技术栈），忽略它，只填和本 section 强相关的部分。

## 输出

严格按以下 JSON 返回，不要加任何解释或 Markdown 代码块以外的文字：

\`\`\`json
{
  "fields": [
    { "id": "字段id", "value": "最终值", "tags": ["tag1", "tag2"] }
  ]
}
\`\`\`
`;
}

function parseAutofillResponse(raw: string): AutofillFieldOutput[] {
  let s = raw.trim();

  const openMarker = s.indexOf('```');
  if (openMarker >= 0) {
    const contentStart = s.indexOf('\n', openMarker);
    const closeMarker = s.lastIndexOf('```');
    if (contentStart >= 0 && closeMarker > contentStart + 1) {
      s = s.slice(contentStart + 1, closeMarker).trim();
    }
  }

  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }

  let parsed: { fields?: unknown } = {};
  try {
    parsed = JSON.parse(s);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.fields)) return [];

  const out: AutofillFieldOutput[] = [];
  for (const raw of parsed.fields as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as { id?: unknown; value?: unknown; tags?: unknown };
    const id = String(f.id ?? '').trim();
    if (!id) continue;
    const value = typeof f.value === 'string' ? f.value : '';
    let tags: string[] | undefined;
    if (Array.isArray(f.tags)) {
      tags = (f.tags as unknown[])
        .flatMap((t) => splitCombinedValue(String(t)))
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 40);
      tags = Array.from(new Set(tags));
    }
    out.push({ id, value, tags });
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AutofillRequest;

    if (!body.userDescription?.trim()) {
      return NextResponse.json(
        { success: false, error: '请先用人话描述一下你想要什么' },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.fields) || body.fields.length === 0) {
      return NextResponse.json(
        { success: false, error: '该部分没有可填字段' },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 },
      );
    }

    const { data: apiConfig } = await supabase
      .from('api_configs')
      .select()
      .eq('user_id', user.id)
      .single();

    if (!apiConfig) {
      return NextResponse.json(
        { success: false, error: '请先在设置中配置 AI API Key' },
        { status: 400 },
      );
    }

    const prompt = buildAutofillPrompt(body);
    const raw = await callAI(
      apiConfig.provider as 'kimi' | 'gemini' | 'deepseek' | 'openai' | 'claude',
      apiConfig.api_key,
      prompt,
    );

    const fields = parseAutofillResponse(raw);

    if (fields.length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI 返回结果解析失败，请换一种说法再试' },
        { status: 500 },
      );
    }

    const requestedIds = new Set(body.fields.map((f) => f.id));
    const filtered = fields.filter((f) => requestedIds.has(f.id));

    return NextResponse.json({ success: true, fields: filtered });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Composer autofill-section error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
