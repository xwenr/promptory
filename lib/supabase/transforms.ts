import type { Database } from './types';
import type { PromptRecord, PromptVersion } from '@/lib/types';

type DbPrompt = Database['public']['Tables']['prompts']['Row'];
type DbVersion = Database['public']['Tables']['prompt_versions']['Row'];

export type PromptWithVersions = DbPrompt & {
  prompt_versions: DbVersion[];
};

export function dbToPromptRecord(row: PromptWithVersions): PromptRecord {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    modelUsed: row.model_used,
    scene: row.scene,
    goalClusters: row.goal_clusters,
    images: row.images ?? [],
    currentVer: row.current_ver,
    versions: (row.prompt_versions ?? [])
      .sort((a, b) => a.ver - b.ver)
      .map(dbToVersion),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dbToVersion(v: DbVersion): PromptVersion {
  return {
    ver: v.ver,
    content: v.content,
    effect:
      v.effect_score != null
        ? {
            score: v.effect_score,
            outputContent: v.effect_output ?? '',
            notes: v.effect_notes ?? '',
          }
        : null,
    isStarred: v.is_starred,
    updatedAt: v.updated_at,
    changeNote: v.change_note,
  };
}
