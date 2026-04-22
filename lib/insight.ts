import type { ClusterInsight } from './types';

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

  return `你是一位 Prompt 工程专家。我积累了一批用于「${cluster}」目标的 Prompt，请对比分析高分和低分 Prompt 的结构差异，找出高分 Prompt 共有的结构要素。

## 高分 Prompt（评分 ≥ 4星，共 ${highScorePrompts.length} 条）

${highSection}

## 低分 Prompt（评分 ≤ 2星，共 ${lowScorePrompts.length} 条）

${lowSection}

## 分析要求

1. 找出高分 Prompt 共有的 3-6 个结构要素（如：技术栈声明、风格约束、输出格式要求等）
2. 如果有低分数据，标注低分 Prompt 普遍缺失的要素
3. 基于分析结果，生成一个最佳模板

请严格按以下 JSON 格式返回，不要添加任何其他文字：

\`\`\`json
{
  "patterns": [
    {"name": "要素名称", "example": "从高分 Prompt 中提取的典型示例文本", "found": true}
  ],
  "missingInLow": ["低分普遍缺失的要素名称1", "要素名称2"],
  "bestTemplate": "生成的最佳模板文本，用 [占位符] 标注可替换部分"
}
\`\`\``;
}

export function parseInsightResponse(
  raw: string,
  cluster: string,
  highCount: number,
  lowCount: number,
  totalCount: number,
): ClusterInsight {
  let jsonStr = raw;
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  return {
    cluster,
    totalCount,
    highScoreCount: highCount,
    lowScoreCount: lowCount,
    patterns: (parsed.patterns || []).map((p: { name: string; example: string; found?: boolean }) => ({
      name: p.name,
      example: p.example,
      found: p.found !== false,
    })),
    missingInLow: parsed.missingInLow || [],
    bestTemplate: parsed.bestTemplate || '',
    analyzedAt: new Date().toISOString(),
  };
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
    model: 'moonshot-v1-8k',
    format: 'openai',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
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
      temperature: 0.3,
      max_tokens: 2000,
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
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
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
      max_tokens: 2000,
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
