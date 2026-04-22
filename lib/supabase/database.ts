import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { dbToPromptRecord, type PromptWithVersions } from './transforms';
import type { PromptRecord, NewPromptForm, EditForm, VersionEffect } from '@/lib/types';

type Client = SupabaseClient<Database>;

export interface FetchOptions {
  scene?: string;
  search?: string;
  sort?: 'recent' | 'score' | 'versions';
  model?: string;
  goalCluster?: string;
}

/* ── Image Upload ── */

const BUCKET = 'prompt-images';

export async function uploadImages(
  supabase: Client,
  userId: string,
  files: File[],
): Promise<string[]> {
  const urls: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) {
      if (error.message.includes('not found') || error.message.includes('Bucket')) {
        throw new Error(
          '存储桶 prompt-images 不存在，请在 Supabase Dashboard → Storage 中手动创建一个名为 "prompt-images" 的 public bucket',
        );
      }
      errors.push(`${file.name}: ${error.message}`);
      continue;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  if (errors.length > 0 && urls.length === 0) {
    throw new Error(`图片上传失败: ${errors[0]}`);
  }
  return urls;
}

/* ── Prompts ── */

export async function fetchPrompts(
  supabase: Client,
  options: FetchOptions = {},
): Promise<PromptRecord[]> {
  let query = supabase
    .from('prompts')
    .select('*, prompt_versions(*)');

  if (options.scene) {
    query = query.eq('scene', options.scene);
  }
  if (options.model) {
    query = query.eq('model_used', options.model);
  }
  if (options.goalCluster) {
    query = query.contains('goal_clusters', [options.goalCluster]);
  }
  if (options.search) {
    const t = `%${options.search}%`;
    query = query.or(`title.ilike.${t},goal.ilike.${t}`);
  }

  switch (options.sort) {
    case 'versions':
      query = query.order('current_ver', { ascending: false });
      break;
    case 'recent':
    default:
      query = query.order('updated_at', { ascending: false });
      break;
  }

  const { data, error } = await query;
  if (error) throw error;

  let records = (data as PromptWithVersions[]).map(dbToPromptRecord);

  if (options.sort === 'score') {
    records.sort((a, b) => {
      const best = (r: PromptRecord) =>
        Math.max(0, ...r.versions.map((v) => v.effect?.score ?? 0));
      return best(b) - best(a);
    });
  }

  return records;
}

export async function createPrompt(
  supabase: Client,
  userId: string,
  form: NewPromptForm,
  imageUrls?: string[],
): Promise<PromptRecord> {
  const model = form.customModel || form.modelUsed || '待选择';

  const { data: prompt, error: pErr } = await supabase
    .from('prompts')
    .insert({
      user_id: userId,
      title: form.title,
      goal: form.goal,
      model_used: model,
      scene: form.scene,
      goal_clusters: form.goalClusters,
      images: imageUrls ?? [],
      current_ver: 1,
    })
    .select()
    .single();

  if (pErr) throw pErr;

  const { data: ver, error: vErr } = await supabase
    .from('prompt_versions')
    .insert({
      prompt_id: prompt.id,
      ver: 1,
      content: form.promptContent,
      change_note: form.note || '初始版本',
    })
    .select()
    .single();

  if (vErr) throw vErr;

  return dbToPromptRecord({ ...prompt, prompt_versions: [ver] });
}

export async function updatePrompt(
  supabase: Client,
  promptId: string,
  editForm: EditForm,
  currentVer: number,
): Promise<void> {
  const { error: pErr } = await supabase
    .from('prompts')
    .update({
      title: editForm.title,
      goal: editForm.goal,
      model_used: editForm.modelUsed,
      goal_clusters: editForm.goalClusters,
      images: editForm.images,
    })
    .eq('id', promptId);

  if (pErr) throw pErr;

  const { error: vErr } = await supabase
    .from('prompt_versions')
    .update({
      content: editForm.content,
      change_note: editForm.changeNote,
    })
    .eq('prompt_id', promptId)
    .eq('ver', currentVer);

  if (vErr) throw vErr;
}

export async function deletePrompt(
  supabase: Client,
  promptId: string,
): Promise<void> {
  const { error } = await supabase.from('prompts').delete().eq('id', promptId);
  if (error) throw error;
}

/* ── Versions ── */

export async function forkVersion(
  supabase: Client,
  promptId: string,
  currentContent: string,
  newVer: number,
  changeNote: string,
): Promise<void> {
  const { error: vErr } = await supabase
    .from('prompt_versions')
    .insert({
      prompt_id: promptId,
      ver: newVer,
      content: currentContent,
      change_note: changeNote || `基于 v${newVer - 1} 创建`,
    });

  if (vErr) throw vErr;

  const { error: pErr } = await supabase
    .from('prompts')
    .update({ current_ver: newVer })
    .eq('id', promptId);

  if (pErr) throw pErr;
}

export async function saveEffect(
  supabase: Client,
  promptId: string,
  ver: number,
  effect: VersionEffect,
  modelUsed?: string,
): Promise<void> {
  const { error: vErr } = await supabase
    .from('prompt_versions')
    .update({
      effect_score: effect.score,
      effect_output: effect.outputContent || null,
      effect_notes: effect.notes || null,
    })
    .eq('prompt_id', promptId)
    .eq('ver', ver);

  if (vErr) throw vErr;

  if (modelUsed) {
    const { error: pErr } = await supabase
      .from('prompts')
      .update({ model_used: modelUsed })
      .eq('id', promptId);

    if (pErr) throw pErr;
  }
}

export async function toggleStar(
  supabase: Client,
  promptId: string,
  ver: number,
  currentlyStarred: boolean,
): Promise<void> {
  await supabase
    .from('prompt_versions')
    .update({ is_starred: false })
    .eq('prompt_id', promptId);

  if (!currentlyStarred) {
    await supabase
      .from('prompt_versions')
      .update({ is_starred: true })
      .eq('prompt_id', promptId)
      .eq('ver', ver);
  }
}

/* ── API Config ── */

export async function getApiConfig(supabase: Client) {
  const { data } = await supabase.from('api_configs').select().single();
  return data;
}

export async function saveApiConfig(
  supabase: Client,
  userId: string,
  provider: string,
  apiKey: string,
) {
  const { error } = await supabase.from('api_configs').upsert(
    {
      user_id: userId,
      provider,
      api_key: apiKey,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}
