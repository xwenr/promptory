import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callAI } from '@/lib/insight';
import { splitCombinedValue } from '@/lib/composer';

interface SuggestRequest {
  fieldLabel: string;
  fieldPlaceholder: string;
  fieldDescription?: string;
  scene?: string;
  cluster?: string;
  existingOptions?: string[];
  templateBody?: string;
}

function buildSuggestPrompt(req: SuggestRequest): string {
  const sceneLine = req.cluster
    ? `这是「${req.scene || '通用'} · ${req.cluster}」场景下的 Prompt 模板。`
    : `这是一个通用 Prompt 模板。`;

  const ctxLine = req.templateBody
    ? `模板全文（供理解上下文）：\n${req.templateBody.slice(0, 800)}\n`
    : '';

  const descLine = req.fieldDescription
    ? `字段说明：${req.fieldDescription}`
    : '';

  const exclude = (req.existingOptions ?? []).filter((o) => o.trim().length > 0);
  const excludeHint = exclude.length > 0
    ? `用户已经从过往 Prompt 里抽取了这些 tag，它们作为基线：${exclude.map((o) => `"${o}"`).join('、')}。你的任务是在此基础上补充**新的 tag**，不重复。`
    : `用户还没有任何 tag，请从 0 开始给他一批 tag。`;

  return `你是 Prompt 工程助手。${sceneLine}

${ctxLine}
现在需要为模板中的「${req.fieldLabel}」字段（占位符：[${req.fieldPlaceholder}]）补充一批「候选 tag」。
${descLine}

${excludeHint}

## 输出必须遵守的硬性要求

- 每个元素是一个**原子 tag**，不是短句、不是长描述、不是括号补充说明。
- 长度：中文 ≤ 8 字；英文 ≤ 3 个词。
- 一个 tag 只表达一个属性，多个属性必须拆成多个 tag。
- 绝对禁止在单个候选里用 "and"、"with"、","、"+"、"、" 把多个属性拼在一起。
- 绝对禁止在 tag 里带"如："、"例如"、"比如"、"e.g." 等示例引导词；tag 本身**就是**示例值，不需要再加引导。
- 绝对禁止在 tag 末尾追加括号补充（"Linear 风格（大量留白）" ❌，应拆为 "Linear 风格" / "大量留白" 两个 tag）。
- 若字段本质是代码、URL、链接、完整描述等无法 tag 化的内容，直接返回空数组 \`[]\`。
- 数量：6-10 个，之间要差异化，覆盖不同维度。

### 正面示例（整体风格）
["dark", "moody", "cinematic", "warm cream", "editorial", "minimal", "brutalist", "glassmorphism"]

### 反面示例（以下都算错）
- "dark, moody, and cinematic with a warm cream color palette"   // 多属性挤在一起
- "Linear 风格（大量留白、极边框）"                                 // 括号扩展
- "现代感强、配色大胆"                                               // 并列属性

### 正面示例（技术栈）
["React", "Vite", "TypeScript", "Tailwind CSS", "shadcn/ui", "framer-motion", "lucide-react"]

### 反面示例
- "React + Vite + TypeScript + Tailwind"

请严格按以下 JSON 格式返回，不要添加任何其他文字：

\`\`\`json
{
  "options": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"]
}
\`\`\``;
}

function parseOptions(raw: string): string[] {
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

  try {
    const parsed = JSON.parse(s) as { options?: unknown };
    if (Array.isArray(parsed.options)) {
      return (parsed.options as unknown[])
        .map((o) => String(o).trim())
        .filter((o: string) => o.length > 0);
    }
  } catch {
    /* fallback to regex */
  }

  const options: string[] = [];
  const arrRe = /"options"\s*:\s*\[([^\]]*)\]/;
  const arrMatch = s.match(arrRe);
  if (arrMatch) {
    const items = arrMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g);
    for (const item of items) {
      const v = item[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
      if (v) options.push(v);
    }
  }
  return options;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SuggestRequest;

    if (!body.fieldLabel || !body.fieldPlaceholder) {
      return NextResponse.json(
        { success: false, error: '缺少 fieldLabel 或 fieldPlaceholder' },
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

    const prompt = buildSuggestPrompt(body);
    const raw = await callAI(
      apiConfig.provider as 'kimi' | 'gemini' | 'deepseek' | 'openai' | 'claude',
      apiConfig.api_key,
      prompt,
    );

    const rawOptions = parseOptions(raw);

    // Server-side tag sanitization: re-split composite strings and drop obviously
    // over-long tokens so a misbehaving model cannot push long descriptions through.
    const MAX_TAG_LENGTH = 40;
    const seen = new Set<string>();
    const existing = new Set((body.existingOptions ?? []).map((o) => o.trim().toLowerCase()));
    const options: string[] = [];
    for (const opt of rawOptions) {
      for (const piece of splitCombinedValue(opt)) {
        const trimmed = piece.trim().replace(/^["'`]|["'`]$/g, '');
        if (!trimmed) continue;
        if (trimmed.length > MAX_TAG_LENGTH) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key) || existing.has(key)) continue;
        seen.add(key);
        options.push(trimmed);
      }
    }

    if (options.length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI 返回结果解析失败，请重试' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, options });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Composer suggest error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
