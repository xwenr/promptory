export const CLUSTERS_BY_SCENE: Record<string, string[]> = {
  coding: [
    '前端页面生成', '组件开发', '功能代码生成', 'Bug 修复与 Debug',
    'API 接口设计', '数据库设计', '代码重构', '代码解释',
  ],
  academic: [
    '论文润色', '文献综述生成', '研究背景撰写', '摘要生成',
    '实验设计', '数据分析解读', '论文结构梳理', '学术翻译',
  ],
  pm: [
    'OKR 制定', '产品规划路线图', '竞品分析',
    '需求拆解与排期', 'PRD 撰写', '功能流程设计',
    '用户故事生成', '验收标准定义', '方案评审',
    '需求文档优化', '数据报告解读', '会议纪要整理',
  ],
  other: ['内容创作', '文案优化', '翻译', '总结提炼', '其他'],
};

export interface ModelGroup {
  provider: string;
  color: string;
  models: string[];
}

export const MODEL_GROUPS: ModelGroup[] = [
  { provider: 'Kimi', color: 'bg-blue-500', models: ['Kimi K2', 'Kimi K1.5'] },
  { provider: 'OpenAI', color: 'bg-emerald-500', models: ['GPT-4o', 'GPT-o3', 'GPT-o4-mini'] },
  { provider: 'Anthropic', color: 'bg-amber-500', models: ['Claude 4 Sonnet', 'Claude 3.7 Sonnet', 'Claude 3.5 Haiku'] },
  { provider: 'Google', color: 'bg-sky-500', models: ['Gemini 2.5 Pro', 'Gemini 2.0 Flash'] },
  { provider: 'DeepSeek', color: 'bg-violet-500', models: ['DeepSeek V3', 'DeepSeek R1'] },
  { provider: 'xAI', color: 'bg-rose-500', models: ['Grok 3'] },
];

export const MODELS: { name: string; color: string }[] = MODEL_GROUPS.flatMap((g) =>
  g.models.map((m) => ({ name: m, color: g.color })),
);

export const GOAL_PLACEHOLDERS: Record<string, string> = {
  coding: '例：用 React + Tailwind 生成现代风 SaaS 登录页',
  academic: '例：润色这段研究背景，符合 Nature 期刊风格',
  pm: '例：基于以下需求生成完整的用户故事列表',
  other: '例：将以下技术文档翻译为英文，保持术语一致性',
};

export const SCENE_LABELS: Record<string, string> = {
  coding: 'Vibe Coding',
  academic: '学术写作',
  pm: '产品经理',
  other: '其他',
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}
