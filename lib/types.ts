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

export interface ClusterInsight {
  cluster: string;
  totalCount: number;
  highScoreCount: number;
  lowScoreCount: number;
  patterns: InsightPattern[];
  missingInLow: string[];
  bestTemplate: string;
  analyzedAt?: string;
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
