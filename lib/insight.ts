import type { ClusterInsight, SectionBrief, SectionBriefId } from './types';

interface PromptData {
  title: string;
  content: string;
  score: number;
  goal: string;
}

export function buildAnalysisPrompt(
  cluster: string,
  highScorePrompts: PromptData[],
  lowScorePrompts: PromptData[],
): string {
  const highSection = highScorePrompts
    .map(
      (p, i) =>
        `### 高分 Prompt ${i + 1}（${p.score}星）\n标题：${p.title}\n目标：${p.goal}\n内容：\n${p.content}`,
    )
    .join('\n\n');

  const lowSection =
    lowScorePrompts.length > 0
      ? lowScorePrompts
          .map(
            (p, i) =>
              `### 低分 Prompt ${i + 1}（${p.score}星）\n标题：${p.title}\n目标：${p.goal}\n内容：\n${p.content}`,
          )
          .join('\n\n')
      : '（无低分数据）';

  return `你是一位 Prompt 工程专家，同时擅长把技术概念翻译成"不写代码的人也能秒懂"的人话。

我积累了一批用于「${cluster}」目标的 Prompt，请对比分析高分和低分 Prompt 的结构差异，找出高分 Prompt 共有的结构要素，并产出一个对非开发者（vibe coder）友好的模板。

## 高分 Prompt（评分 ≥ 4星，共 ${highScorePrompts.length} 条）

${highSection}

## 低分 Prompt（评分 ≤ 2星，共 ${lowScorePrompts.length} 条）

${lowSection}

## 分析要求

1. 找出高分 Prompt 共有的 3-6 个结构要素（如：技术栈声明、风格约束、输出格式要求等）
2. 如果有低分数据，标注低分 Prompt 普遍缺失的要素
3. 基于分析结果，生成一个最佳模板，模板中用 [占位符] 标注可替换部分。占位符命名**必须遵守下面「占位符命名规则」**。
4. 针对每一个 [占位符]，除了 quickOptions 之外，再给出两个对"vibe coder"友好的字段：
   - \`friendlyLabel\`：这个字段在**非开发者**眼里叫什么。例："Hover/Focus状态" → "鼠标悬停/点击时的反馈动效"；"代码组织" → "页面模块怎么拆分"；"Google Fonts链接" → "想用的字体"。不超过 18 字。
   - \`friendlyHint\`：用一句话告诉用户"描述这个字段时可以聊哪些方面"，几个维度用 "/" 分隔。例："颜色变化 / 放大缩小 / 过渡速度"；"字体名 / 字重 / 用在哪里"。不超过 30 字。
5. 针对前端字段分组（以下称 **sectionBriefs 分组**，context=场景目标, tech=技术约束, design=视觉设计, output=输出交付, other=其他；**注意：这是前端 UI 层面的字段分组，和 bestTemplate 文本内的 markdown 章节标题不是一回事**），在 \`sectionBriefs\` 里给出：
   - \`dimensions\`：3-5 个"该分组要描述的维度"，用人话短 tag（例 design → ["色调","氛围","字体","主色"]）。
   - \`example\`：一段**用户用人话可能怎么描述这个分组** 的示例（2-4 句话，贴合「${cluster}」场景）。例 design：「想要偏深色的科幻感，主色 #0A84FF 亮蓝带紫色霓虹点缀，字体选 Inter 做正文，Instrument Serif 做大标题，整体要有 Awwwards 那种大胆留白的编辑感。」
   - 如果某个分组在模板里没有对应字段（field），就可以省略它。

## 占位符命名规则（这是硬性要求，违反视为无效输出）

- 占位符名必须是一个**干净的短名词/短语**，中文 ≤ 10 字，英文 ≤ 3 词。
- **禁止**在占位符里写示例、枚举、代码片段或解释。示例应放到 quickOptions 里，不能塞进 \`[...]\` 中。
- **禁止**出现"如"、"例如"、"比如"、"例"、"e.g."、"i.e."、"for example" 等示例引导词。
- **禁止**在占位符里出现逗号、顿号、冒号后跟示例内容、括号补充说明。
- **禁止**把章节标题 / 结构骨架包成占位符。章节标题应该作为**纯文本**出现在模板里，不要加 \`[...]\`。
- **禁止**让占位符以示例开头（整段都是示例、没有字段名的 placeholder 是错的）。

### 正面示例
- \`[技术栈]\`、\`[整体风格]\`、\`[主色]\`、\`[Hover/Focus状态]\`、\`[代码组织]\`、\`[图标库]\`
- 章节标题写法：\`## SECTION 1: HERO\`（整行是纯文本，没有方括号）

### 反面示例（以下写法都算错，会被视为无效输出）
- \`[技术栈，如：React + Vite + TypeScript + Tailwind CSS]\`     // 带示例
- \`[URL或图标库名，如：lucide-react (ArrowRight, Check)]\`      // 带示例 + 括号
- \`[Hover/Focus状态，如：hover:scale-110, hover:bg-white/10]\`  // 带代码示例
- \`[代码组织，如：separate components for Navbar, Hero...]\`    // 带长句示例
- \`[SECTION 1: HERO]\` / \`[SECTION 2: ABOUT/FEATURES]\`        // 把章节标题当占位符
- \`[如：bg-black, min-h-screen, max-w-6xl mx-auto]\`            // 整段都是示例，没有字段名

## bestTemplate 整体结构示范（必读，直接对照抄）

### ❌ 错误的 bestTemplate（AI 经常写出来、被用户投诉的形态）

\`\`\`
[SECTION 1: HERO]
- 背景类名：[如：bg-black, min-h-screen, max-w-6xl mx-auto]
- 动画：[Hover/Focus状态，如：hover:scale-110, hover:bg-white/10 transition]
- 技术栈：[技术栈，如：React + Vite + TypeScript + Tailwind CSS + shadcn/ui]

[SECTION 2: ABOUT/FEATURES]
- 组件：[自定义组件逻辑，如：requestAnimationFrame-based fade system, character reveal]
\`\`\`

错在哪：
- 章节标题 \`SECTION 1: HERO\` 被包进 \`[...]\` → 它是结构骨架，不是字段
- \`[如：...]\` 整段就是示例 → 前面连字段名都没有
- \`[技术栈，如：React + Vite + ...]\` → 示例塞进了方括号里

### ✅ 正确的 bestTemplate（我们要的形态）

\`\`\`
## 项目定位
打造一个[项目类型]，面向[目标用户]，核心价值是[产品定位]。

## 技术栈
使用[技术栈]搭建，样式方案选[样式方案]，动画用[动画库]，图标来自[图标库]。

## SECTION 1: HERO
- 背景类名：[Hero背景]
- 入场动画：[入场动画]
- Hover/Focus 状态：[Hover状态]

## SECTION 2: ABOUT / FEATURES
- 结构：[模块结构]
- 文案风格：[文案风格]

## 视觉设计
整体风格偏[整体风格]，主色 [主色]，字体 [字体]（用于 [字体用途]），留白和节奏遵循 [布局节奏]。

## 输出要求
输出 [输出结构]，按 [结构顺序] 组织，每个模块包含 [模块内容要求]。
\`\`\`

对比要点（AI 必须做到）：
1. **章节标题是纯文本 markdown heading（\`## xxx\`），绝对不加方括号**。\`## SECTION 1: HERO\` 是对的，\`## [SECTION 1: HERO]\` 是错的。
2. **每个 \`[占位符]\` 都是干净名词**（\`[主色]\` / \`[字体]\` / \`[Hover状态]\`），不带"如：xxx"、不带代码、不带括号补充。
3. **示例从不出现在 bestTemplate 里**，全部放进对应 placeholder 的 \`quickOptions\`。
4. **每个占位符都处在一段上下文描述里**（"使用[技术栈]搭建"），而不是"字段名 + 一串示例"的列表骨架。
5. 占位符位置是**用户要替换的位置**，不是"示范值"——AI 不要把示例文本放进去。

## quickOptions 必须遵守的格式（这是硬性要求，违反视为无效输出）

- 每个元素是一个**独立的原子 tag**，不是短句，更不是长描述。
- 长度：中文 ≤ 8 字，英文单词 ≤ 3 个词。
- 一个 tag 只表达一个属性，多个属性必须拆成多个 tag。
- 绝对禁止用 "and"、"with"、"," 把多个属性塞进同一个候选里；禁止写成"…with a warm cream palette"这种并列短语。
- 若该字段需要代码、URL、链接、完整描述等无法 tag 化的自由文本，则返回空数组 \`[]\`，由用户自行填写。

### 正面示例（整体风格）
["dark", "moody", "cinematic", "warm cream", "editorial", "minimal", "playful", "brutalist"]

### 反面示例（以下都算错）
- ["dark, moody, and cinematic with a warm cream color palette"]   // 单个元素包含多个属性
- ["Linear 风格（大量留白、极边框）"]                                // 括号补充说明也算长描述
- ["现代感强、配色大胆"]                                              // 把多个属性合并

### 正面示例（技术栈）
["React", "Vite", "TypeScript", "Tailwind CSS", "shadcn/ui", "framer-motion", "lucide-react", "zustand"]

### 反面示例
- ["React + Vite + TypeScript + Tailwind CSS + shadcn/ui"]           // 合并成一串
- ["React 技术栈全家桶"]                                               // 抽象词

请严格按以下 JSON 格式返回，不要添加任何其他文字。
重要：所有字符串值中的双引号必须用 \\" 转义，换行用 \\n 表示，确保输出是合法 JSON。
重要：placeholders 数组里每个 placeholder 必须和 bestTemplate 中的 [占位符] 名称严格一致。
重要：占位符名字**不得**带"如：xxx"、"例如"等示例引导词，示例一律放进 quickOptions。
重要：quickOptions 里每个元素必须是原子 tag，不能是并列短语、完整描述或代码。
重要：friendlyLabel / friendlyHint 是给非开发者看的人话，不要出现技术术语或代码符号。

\`\`\`json
{
  "patterns": [
    {"name": "要素名称", "example": "从高分 Prompt 中提取的典型示例文本", "found": true}
  ],
  "missingInLow": ["低分普遍缺失的要素名称1", "要素名称2"],
  "bestTemplate": "生成的最佳模板文本，用 [占位符] 标注可替换部分。模板中的换行用 \\n 表示，引号用 \\" 转义",
  "placeholders": [
    {
      "placeholder": "占位符名称（干净短名词，不能带示例）",
      "friendlyLabel": "人话标题（给 vibe coder 看）",
      "friendlyHint": "一句话：可以描述的维度 / 用 / 分隔",
      "description": "该字段的作用或填写指引（可选）",
      "quickOptions": ["tag1", "tag2", "tag3", "tag4", "tag5"]
    }
  ],
  "sectionBriefs": {
    "context": { "dimensions": ["项目类型", "目标用户", "产品定位"], "example": "人话描述示例…" },
    "tech":    { "dimensions": ["框架", "样式方案", "动画库"],       "example": "人话描述示例…" },
    "design":  { "dimensions": ["色调", "氛围", "字体", "主色"],     "example": "人话描述示例…" },
    "output":  { "dimensions": ["结构", "长度", "格式"],              "example": "人话描述示例…" }
  }
}
\`\`\``;
}

function repairJSON(str: string): string {
  let s = str.trim();

  // Escape unescaped control characters inside string values
  s = s.replace(/[\x00-\x1f]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '';
  });

  // Try to fix unescaped quotes inside the bestTemplate value.
  // Strategy: locate "bestTemplate" : "...", find the boundary quotes,
  // and escape everything in between.
  const btKey = '"bestTemplate"';
  const btIdx = s.indexOf(btKey);
  if (btIdx >= 0) {
    const colonIdx = s.indexOf(':', btIdx + btKey.length);
    if (colonIdx >= 0) {
      const openQuote = s.indexOf('"', colonIdx + 1);
      if (openQuote >= 0) {
        // The closing quote is the last " before the final } of the JSON
        const lastBrace = s.lastIndexOf('}');
        if (lastBrace > openQuote) {
          let closingQuote = -1;
          for (let i = lastBrace - 1; i > openQuote; i--) {
            if (s[i] === '"' && s[i - 1] !== '\\') {
              closingQuote = i;
              break;
            }
          }
          if (closingQuote > openQuote) {
            const inner = s.slice(openQuote + 1, closingQuote);
            const escaped = inner.replace(/(?<!\\)"/g, '\\"');
            if (escaped !== inner) {
              s = s.slice(0, openQuote + 1) + escaped + s.slice(closingQuote);
            }
          }
        }
      }
    }
  }

  // Fix unclosed brackets/braces
  const openBraces = (s.match(/{/g) || []).length;
  const closeBraces = (s.match(/}/g) || []).length;
  const openBrackets = (s.match(/\[/g) || []).length;
  const closeBrackets = (s.match(/]/g) || []).length;

  if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
    const lastGoodComma = Math.max(
      s.lastIndexOf('",'),
      s.lastIndexOf('"],'),
      s.lastIndexOf('},'),
    );
    if (lastGoodComma > 0) {
      s = s.slice(0, lastGoodComma + 1);
    }
    const remaining = s;
    const ob = (remaining.match(/\[/g) || []).length - (remaining.match(/]/g) || []).length;
    const oc = (remaining.match(/{/g) || []).length - (remaining.match(/}/g) || []).length;
    for (let i = 0; i < ob; i++) s += ']';
    for (let i = 0; i < oc; i++) s += '}';
  }

  return s;
}

/**
 * Regex-based fallback: extracts fields individually when JSON.parse fails entirely.
 */
function extractByRegex(raw: string): {
  patterns: { name: string; example: string; found: boolean }[];
  missingInLow: string[];
  bestTemplate: string;
  placeholders: { placeholder: string; description?: string; quickOptions: string[] }[];
} {
  const patterns: { name: string; example: string; found: boolean }[] = [];
  const patRe = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"example"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"found"\s*:\s*(true|false)/g;
  let m;
  while ((m = patRe.exec(raw)) !== null) {
    patterns.push({ name: m[1], example: m[2], found: m[3] === 'true' });
  }

  const missingInLow: string[] = [];
  const missingRe = /"missingInLow"\s*:\s*\[([^\]]*)\]/;
  const missingMatch = raw.match(missingRe);
  if (missingMatch) {
    const items = missingMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g);
    for (const item of items) missingInLow.push(item[1]);
  }

  let bestTemplate = '';
  const tmplRe = /"bestTemplate"\s*:\s*"/;
  const tmplMatch = tmplRe.exec(raw);
  if (tmplMatch) {
    const start = tmplMatch.index + tmplMatch[0].length;
    let end = start;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '\\') { i++; continue; }
      if (raw[i] === '"') { end = i; break; }
    }
    bestTemplate = raw
      .slice(start, end)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
  }

  const placeholders: { placeholder: string; description?: string; quickOptions: string[] }[] = [];
  const phArrayRe = /"placeholders"\s*:\s*\[([\s\S]*?)\](?=\s*[,}])/;
  const phArrayMatch = raw.match(phArrayRe);
  if (phArrayMatch) {
    const itemRe = /\{\s*"placeholder"\s*:\s*"((?:[^"\\]|\\.)*)"(?:\s*,\s*"description"\s*:\s*"((?:[^"\\]|\\.)*)")?\s*,\s*"quickOptions"\s*:\s*\[([^\]]*)\]\s*\}/g;
    let pm;
    while ((pm = itemRe.exec(phArrayMatch[1])) !== null) {
      const placeholder = pm[1];
      const description = pm[2];
      const optsRaw = pm[3];
      const quickOptions: string[] = [];
      const optsItems = optsRaw.matchAll(/"((?:[^"\\]|\\.)*)"/g);
      for (const item of optsItems) quickOptions.push(item[1]);
      placeholders.push({
        placeholder,
        ...(description ? { description } : {}),
        quickOptions,
      });
    }
  }

  return { patterns, missingInLow, bestTemplate, placeholders };
}

export function parseInsightResponse(
  raw: string,
  cluster: string,
  highCount: number,
  lowCount: number,
  totalCount: number,
): ClusterInsight {
  let jsonStr = raw;

  const openMarker = raw.indexOf('```');
  if (openMarker >= 0) {
    const contentStart = raw.indexOf('\n', openMarker);
    const closeMarker = raw.lastIndexOf('```');
    if (contentStart >= 0 && closeMarker > contentStart + 1) {
      jsonStr = raw.slice(contentStart + 1, closeMarker).trim();
    }
  }

  if (!jsonStr.startsWith('{')) {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = raw.slice(firstBrace, lastBrace + 1);
    }
  }

  let parsed: {
    patterns?: unknown[];
    missingInLow?: string[];
    bestTemplate?: string;
    placeholders?: unknown[];
    sectionBriefs?: unknown;
  };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    try {
      parsed = JSON.parse(repairJSON(jsonStr));
    } catch {
      parsed = extractByRegex(jsonStr);
    }
  }

  const rawPh = Array.isArray(parsed.placeholders) ? parsed.placeholders : [];
  const placeholders: {
    placeholder: string;
    friendlyLabel?: string;
    friendlyHint?: string;
    description?: string;
    quickOptions: string[];
  }[] = [];
  for (const p of rawPh) {
    const obj = p as {
      placeholder?: string;
      friendlyLabel?: string;
      friendlyHint?: string;
      description?: string;
      quickOptions?: unknown;
    };
    const placeholder = String(obj.placeholder || '').trim();
    if (!placeholder) continue;
    const quickOptions = Array.isArray(obj.quickOptions)
      ? (obj.quickOptions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
      : [];
    const entry: {
      placeholder: string;
      friendlyLabel?: string;
      friendlyHint?: string;
      description?: string;
      quickOptions: string[];
    } = { placeholder, quickOptions };
    if (obj.friendlyLabel) entry.friendlyLabel = String(obj.friendlyLabel).trim();
    if (obj.friendlyHint) entry.friendlyHint = String(obj.friendlyHint).trim();
    if (obj.description) entry.description = String(obj.description);
    placeholders.push(entry);
  }

  const sectionBriefs = parseSectionBriefs(parsed.sectionBriefs);

  const rawPatterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
  const patterns = rawPatterns.map((raw) => {
    const p = raw as { name?: string; example?: string; found?: boolean };
    return {
      name: String(p.name || ''),
      example: String(p.example || ''),
      found: p.found !== false,
    };
  });

  return {
    cluster,
    totalCount,
    highScoreCount: highCount,
    lowScoreCount: lowCount,
    patterns,
    missingInLow: Array.isArray(parsed.missingInLow) ? parsed.missingInLow.map(String) : [],
    bestTemplate: typeof parsed.bestTemplate === 'string'
      ? parsed.bestTemplate.replace(/\\n/g, '\n')
      : '',
    placeholders,
    sectionBriefs,
    analyzedAt: new Date().toISOString(),
  };
}

const SECTION_IDS: readonly SectionBriefId[] = ['context', 'tech', 'design', 'output', 'other'];

function parseSectionBriefs(raw: unknown): Partial<Record<SectionBriefId, SectionBrief>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<SectionBriefId, SectionBrief>> = {};
  const src = raw as Record<string, unknown>;
  for (const id of SECTION_IDS) {
    const entry = src[id];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { dimensions?: unknown; example?: unknown };
    const dims = Array.isArray(e.dimensions)
      ? (e.dimensions as unknown[]).map((d) => String(d).trim()).filter((d) => d.length > 0)
      : [];
    const example = typeof e.example === 'string' ? e.example.trim() : '';
    if (dims.length === 0 && !example) continue;
    out[id] = { dimensions: dims, example };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function estimateTokens(prompts: PromptData[]): number {
  const totalChars = prompts.reduce((sum, p) => sum + p.content.length + p.title.length + p.goal.length, 0);
  return Math.ceil(totalChars / 2) + 800;
}

type Provider = 'kimi' | 'gemini' | 'deepseek' | 'openai' | 'claude';

interface ProviderConfig {
  baseUrl: string;
  model: string;
  format: 'openai' | 'gemini' | 'anthropic';
}

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',
    format: 'openai',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    format: 'gemini',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    format: 'openai',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    format: 'openai',
  },
  claude: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-20241022',
    format: 'anthropic',
  },
};

export async function callAI(
  provider: Provider,
  apiKey: string,
  prompt: string,
): Promise<string> {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) throw new Error(`Unsupported provider: ${provider}`);

  if (config.format === 'openai') {
    return callOpenAIFormat(config.baseUrl, config.model, apiKey, prompt);
  } else if (config.format === 'gemini') {
    return callGemini(config.baseUrl, config.model, apiKey, prompt);
  } else {
    return callAnthropic(config.baseUrl, config.model, apiKey, prompt);
  }
}

async function callOpenAIFormat(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一位专业的 Prompt 工程分析师。请用中文回答。' },
        { role: 'user', content: prompt },
      ],
      temperature: 1,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(
    `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callAnthropic(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
      system: '你是一位专业的 Prompt 工程分析师。请用中文回答。',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

/* ── Streaming variants ── */

async function* streamOpenAIFormat(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
): AsyncGenerator<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一位专业的 Prompt 工程分析师。请用中文回答。' },
        { role: 'user', content: prompt },
      ],
      temperature: 1,
      max_tokens: 8000,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const content = json.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch { /* skip malformed chunks */ }
    }
  }
}

async function* streamGemini(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
): AsyncGenerator<string> {
  const res = await fetch(
    `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch { /* skip malformed chunks */ }
    }
  }
}

async function* streamAnthropic(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
): AsyncGenerator<string> {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
      system: '你是一位专业的 Prompt 工程分析师。请用中文回答。',
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop() || '';
    for (const block of events) {
      const dataMatch = block.match(/^data:\s*(.+)$/m);
      if (!dataMatch) continue;
      try {
        const json = JSON.parse(dataMatch[1]);
        if (json.type === 'content_block_delta') {
          const text = json.delta?.text;
          if (text) yield text;
        }
      } catch { /* skip malformed chunks */ }
    }
  }
}

export async function* callAIStream(
  provider: Provider,
  apiKey: string,
  prompt: string,
): AsyncGenerator<string> {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) throw new Error(`Unsupported provider: ${provider}`);

  if (config.format === 'openai') {
    yield* streamOpenAIFormat(config.baseUrl, config.model, apiKey, prompt);
  } else if (config.format === 'gemini') {
    yield* streamGemini(config.baseUrl, config.model, apiKey, prompt);
  } else {
    yield* streamAnthropic(config.baseUrl, config.model, apiKey, prompt);
  }
}

export async function testConnection(
  provider: Provider,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await callAI(provider, apiKey, '请回复"连接成功"四个字。');
    if (result && result.length > 0) {
      return { success: true };
    }
    return { success: false, error: '未收到有效响应' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
