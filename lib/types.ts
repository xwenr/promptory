export interface VersionEffect {
  score: number;
  outputContent: string;
  notes: string;
}

export interface PromptVersion {
  ver: number;
  content: string;
  effect: VersionEffect | null;
  isStarred: boolean;
  updatedAt: string;
  changeNote: string;
}

export interface PromptRecord {
  id: string;
  title: string;
  goal: string;
  modelUsed: string;
  scene: string;
  goalClusters: string[];
  images: string[];
  currentVer: number;
  versions: PromptVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface NewPromptForm {
  title: string;
  goal: string;
  scene: string;
  goalClusters: string[];
  modelUsed: string;
  customModel: string;
  promptContent: string;
  note?: string;
  imageFiles?: File[];
}

export interface EditForm {
  title: string;
  goal: string;
  content: string;
  modelUsed: string;
  goalClusters: string[];
  changeNote: string;
  images: string[];
}

export interface AIProviderConfig {
  provider: 'kimi' | 'gemini' | 'deepseek' | 'openai' | 'claude';
  apiKey: string;
}

export interface InsightPattern {
  name: string;
  example: string;
  found: boolean;
}

export interface PlaceholderSuggestion {
  placeholder: string;
  /** 人话标题 (非技术) — 用于让非开发者也能秒懂这个字段在问什么 */
  friendlyLabel?: string;
  /** 一句话提示：用户要描述哪几方面（例如：「颜色 / 氛围 / 字体 / 交互」） */
  friendlyHint?: string;
  description?: string;
  quickOptions: string[];
}

export type SectionBriefId = 'context' | 'tech' | 'design' | 'output' | 'other';

export interface SectionBrief {
  /** 这个 section 要描述的维度（人话小 tag），例如 ['色调', '氛围', '字体'] */
  dimensions: string[];
  /** 人话示例描述，提示用户可以怎样描述 */
  example: string;
}

export interface ClusterInsight {
  cluster: string;
  totalCount: number;
  highScoreCount: number;
  lowScoreCount: number;
  patterns: InsightPattern[];
  missingInLow: string[];
  bestTemplate: string;
  placeholders?: PlaceholderSuggestion[];
  /** 每个 section 的维度 + 示例，用于 Composer 里的一键 AI 填充引导 */
  sectionBriefs?: Partial<Record<SectionBriefId, SectionBrief>>;
  analyzedAt?: string;
}

export interface ComposerFieldOption {
  label: string;
  value: string;
}

export interface ComposerField {
  id: string;
  label: string;
  placeholder: string;
  description?: string;
  /** 人话标题：比如 "Hover/Focus状态" 对应 "鼠标悬停/点击时的反馈动效" */
  friendlyLabel?: string;
  /** 一句话引导：比如 "描述：悬停变化 / 点击反馈 / 过渡速度" */
  friendlyHint?: string;
  type: 'input' | 'textarea';
  quickOptions: ComposerFieldOption[];
  color: string;
  multi?: boolean;
}

export interface ComposerTemplate {
  id: string;
  name: string;
  scene: string;
  cluster: string;
  body: string;
  fields: ComposerField[];
  /** Section 级别的「描述维度 + 人话示例」，用于 AI 一键填充入口 */
  sectionBriefs?: Partial<Record<SectionBriefId, SectionBrief>>;
  sourceInsightAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportEntry {
  title: string;
  goal: string;
  prompt: string;
  model: string;
  score: number | null;
  scene: string;
  goalClusters: string[];
}

export interface InsightRequest {
  cluster: string;
  scene: string;
}

export interface InsightResponse {
  success: boolean;
  data?: ClusterInsight;
  error?: string;
  tokensUsed?: number;
}
