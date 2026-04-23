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

export interface AIApp {
  name: string;
  color: string;
}

export const AI_APPS: AIApp[] = [
  { name: 'ChatGPT', color: 'bg-emerald-500' },
  { name: 'Claude', color: 'bg-amber-500' },
  { name: 'Gemini', color: 'bg-sky-500' },
  { name: 'Kimi', color: 'bg-blue-500' },
  { name: 'DeepSeek', color: 'bg-violet-500' },
  { name: 'Grok', color: 'bg-rose-500' },
  { name: 'Copilot', color: 'bg-teal-500' },
  { name: 'Cursor', color: 'bg-gray-500' },
];

const CUSTOM_APPS_KEY = 'promptory-custom-ai-apps';

export function getCustomAIApps(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_APPS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomAIApp(name: string): void {
  const existing = getCustomAIApps();
  if (!existing.includes(name)) {
    localStorage.setItem(CUSTOM_APPS_KEY, JSON.stringify([...existing, name]));
  }
}

export function getAIAppColor(name: string): string {
  return AI_APPS.find((a) => a.name === name)?.color ?? 'bg-gray-400';
}

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
