'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { PromptRecord, NewPromptForm, EditForm, VersionEffect, ImportEntry } from '@/lib/types';
import { SEED_DATA } from '@/lib/seed-data';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import * as db from '@/lib/supabase/database';

export function usePromptStore() {
  const { user } = useAuth();
  const supabase = isSupabaseConfigured ? createClient() : null;

  const [allPrompts, setAllPrompts] = useState<PromptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [activeScene, setActiveScene] = useState('pm');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'versions'>('recent');
  const [previewingVer, setPreviewingVer] = useState<number | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [effectTarget, setEffectTarget] = useState<{ promptId: string; ver: number } | null>(null);
  const [showForkDialog, setShowForkDialog] = useState(false);

  const hasFetched = useRef(false);

  /* ── Fetch ── */

  useEffect(() => {
    if (hasFetched.current) return;

    if (supabase && user) {
      hasFetched.current = true;
      setLoading(true);
      db.fetchPrompts(supabase)
        .then((data) => {
          setAllPrompts(data);
          const first = data.find((p) => p.scene === 'pm');
          if (first) setSelectedId(first.id);
        })
        .catch((err) => console.error('fetch failed:', err))
        .finally(() => setLoading(false));
    } else if (!isSupabaseConfigured) {
      hasFetched.current = true;
      setAllPrompts(SEED_DATA);
      setSelectedId(SEED_DATA[0]?.id ?? '');
      setLoading(false);
    }
  }, [user, supabase]);

  /* ── Derived ── */

  const filteredPrompts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let result = allPrompts
      .filter((p) => p.scene === activeScene)
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.goal.toLowerCase().includes(q) ||
          p.versions.some((v) => v.content.toLowerCase().includes(q)),
      );

    switch (sortBy) {
      case 'score':
        result = [...result].sort((a, b) => {
          const best = (r: PromptRecord) =>
            Math.max(0, ...r.versions.map((v) => v.effect?.score ?? 0));
          return best(b) - best(a);
        });
        break;
      case 'versions':
        result = [...result].sort((a, b) => b.versions.length - a.versions.length);
        break;
    }

    return result;
  }, [allPrompts, activeScene, searchQuery, sortBy]);

  const selectedPrompt = useMemo(
    () => allPrompts.find((p) => p.id === selectedId) ?? null,
    [allPrompts, selectedId],
  );

  const currentVersion = useMemo(() => {
    if (!selectedPrompt) return null;
    return selectedPrompt.versions.find((v) => v.ver === selectedPrompt.currentVer) ?? null;
  }, [selectedPrompt]);

  const starredVersion = useMemo(() => {
    if (!selectedPrompt) return null;
    return selectedPrompt.versions.find((v) => v.isStarred) ?? null;
  }, [selectedPrompt]);

  const previewVersion = useMemo(() => {
    if (!selectedPrompt) return null;
    if (previewingVer !== null) {
      return selectedPrompt.versions.find((v) => v.ver === previewingVer) ?? currentVersion;
    }
    return currentVersion;
  }, [selectedPrompt, previewingVer, currentVersion]);

  /* ── Actions ── */

  const selectPrompt = useCallback((id: string) => {
    setSelectedId(id);
    setIsEditing(false);
    setEditForm(null);
    setPreviewingVer(null);
  }, []);

  const changeScene = useCallback(
    (scene: string) => {
      setActiveScene(scene);
      setSearchQuery('');
      setIsEditing(false);
      setEditForm(null);
      setPreviewingVer(null);
      const first = allPrompts.find((p) => p.scene === scene);
      setSelectedId(first?.id ?? '');
    },
    [allPrompts],
  );

  const createPrompt = useCallback(
    async (form: NewPromptForm): Promise<PromptRecord | null> => {
      const model = form.customModel || form.modelUsed || '待选择';
      const now = new Date().toISOString();

      let imageUrls: string[] = [];
      let imageError: string | null = null;
      if (form.imageFiles?.length && supabase && user) {
        try {
          imageUrls = await db.uploadImages(supabase, user.id, form.imageFiles);
        } catch (err: unknown) {
          imageError = err instanceof Error ? err.message : '图片上传失败';
          console.error('image upload failed:', err);
        }
      }

      let record: PromptRecord;

      if (supabase && user) {
        try {
          record = await db.createPrompt(supabase, user.id, form, imageUrls);
        } catch (err) {
          console.error('create failed:', err);
          return null;
        }
      } else {
        record = {
          id: Date.now().toString(),
          title: form.title,
          goal: form.goal,
          modelUsed: model,
          scene: form.scene,
          goalClusters: form.goalClusters,
          images: imageUrls,
          currentVer: 1,
          versions: [
            { ver: 1, content: form.promptContent, effect: null, isStarred: false, updatedAt: now, changeNote: form.note || '初始版本' },
          ],
          createdAt: now,
          updatedAt: now,
        };
      }

      setAllPrompts((prev) => [record, ...prev]);
      setActiveScene(form.scene);
      setSelectedId(record.id);
      setShowNewModal(false);
      setPreviewingVer(null);
      setIsEditing(false);
      setEditForm(null);
      return record;
    },
    [user, supabase],
  );

  const startEditing = useCallback(() => {
    if (!selectedPrompt || !currentVersion) return;
    setEditForm({
      title: selectedPrompt.title,
      goal: selectedPrompt.goal,
      content: currentVersion.content,
      modelUsed: selectedPrompt.modelUsed,
      goalClusters: [...selectedPrompt.goalClusters],
      changeNote: currentVersion.changeNote,
      images: [...selectedPrompt.images],
    });
    setIsEditing(true);
  }, [selectedPrompt, currentVersion]);

  const cancelEditing = useCallback(() => {
    setEditForm(null);
    setIsEditing(false);
  }, []);

  const saveEditing = useCallback(async (newImageFiles?: File[]): Promise<string | null> => {
    if (!editForm || !selectedPrompt) return null;
    const now = new Date().toISOString();

    let newImageUrls: string[] = [];
    if (newImageFiles?.length && supabase && user) {
      try {
        newImageUrls = await db.uploadImages(supabase, user.id, newImageFiles);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '图片上传失败';
        return msg;
      }
    }

    const finalImages = [...editForm.images, ...newImageUrls];
    const finalForm = { ...editForm, images: finalImages };

    if (supabase) {
      try {
        await db.updatePrompt(supabase, selectedPrompt.id, finalForm, selectedPrompt.currentVer);
      } catch (err) {
        console.error('update failed:', err);
      }
    }

    setAllPrompts((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPrompt.id) return p;
        return {
          ...p,
          title: finalForm.title,
          goal: finalForm.goal,
          modelUsed: finalForm.modelUsed,
          goalClusters: finalForm.goalClusters,
          images: finalImages,
          updatedAt: now,
          versions: p.versions.map((v) =>
            v.ver === p.currentVer ? { ...v, content: finalForm.content, changeNote: finalForm.changeNote, updatedAt: now } : v,
          ),
        };
      }),
    );
    setEditForm(null);
    setIsEditing(false);
    return null;
  }, [editForm, selectedPrompt, supabase, user]);

  const forkNewVersion = useCallback(
    async (changeNote: string) => {
      if (!selectedPrompt || !currentVersion) return;
      const now = new Date().toISOString();
      const newVer = selectedPrompt.currentVer + 1;

      if (supabase) {
        try {
          await db.forkVersion(supabase, selectedPrompt.id, currentVersion.content, newVer, changeNote);
        } catch (err) {
          console.error('fork failed:', err);
        }
      }

      setAllPrompts((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPrompt.id) return p;
          return {
            ...p,
            currentVer: newVer,
            updatedAt: now,
            versions: [
              ...p.versions,
              {
                ver: newVer,
                content: currentVersion.content,
                effect: null,
                isStarred: false,
                updatedAt: now,
                changeNote: changeNote || `基于 v${selectedPrompt.currentVer} 创建`,
              },
            ],
          };
        }),
      );

      setShowForkDialog(false);
      setPreviewingVer(null);
      setEditForm({
        title: selectedPrompt.title,
        goal: selectedPrompt.goal,
        content: currentVersion.content,
        modelUsed: selectedPrompt.modelUsed,
        goalClusters: [...selectedPrompt.goalClusters],
        changeNote: '',
        images: [...selectedPrompt.images],
      });
      setIsEditing(true);
    },
    [selectedPrompt, currentVersion, supabase],
  );

  const saveEffect = useCallback(
    async (promptId: string, ver: number, effect: VersionEffect, modelUsed?: string) => {
      const now = new Date().toISOString();

      if (supabase) {
        try {
          await db.saveEffect(supabase, promptId, ver, effect, modelUsed);
        } catch (err) {
          console.error('save effect failed:', err);
        }
      }

      setAllPrompts((prev) =>
        prev.map((p) => {
          if (p.id !== promptId) return p;
          return {
            ...p,
            modelUsed: modelUsed || p.modelUsed,
            updatedAt: now,
            versions: p.versions.map((v) => (v.ver === ver ? { ...v, effect, updatedAt: now } : v)),
          };
        }),
      );
      setEffectTarget(null);
    },
    [supabase],
  );

  const toggleStarVersion = useCallback(
    async (ver: number) => {
      if (!selectedPrompt) return;
      const target = selectedPrompt.versions.find((v) => v.ver === ver);
      const isStarred = target?.isStarred ?? false;

      if (supabase) {
        try {
          await db.toggleStar(supabase, selectedPrompt.id, ver, isStarred);
        } catch (err) {
          console.error('star toggle failed:', err);
        }
      }

      setAllPrompts((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPrompt.id) return p;
          return {
            ...p,
            versions: p.versions.map((v) => ({
              ...v,
              isStarred: v.ver === ver ? !v.isStarred : false,
            })),
          };
        }),
      );
    },
    [selectedPrompt, supabase],
  );

  const openEffectModal = useCallback((promptId: string, ver: number) => {
    setEffectTarget({ promptId, ver });
  }, []);

  const removePrompt = useCallback(
    async (promptId: string) => {
      if (supabase) {
        try {
          await db.deletePrompt(supabase, promptId);
        } catch (err) {
          console.error('delete failed:', err);
          return;
        }
      }
      setAllPrompts((prev) => prev.filter((p) => p.id !== promptId));
      if (selectedId === promptId) {
        setSelectedId('');
        setIsEditing(false);
        setEditForm(null);
      }
    },
    [supabase, selectedId],
  );

  const batchImport = useCallback(
    async (entries: ImportEntry[]): Promise<void> => {
      for (const entry of entries) {
        const form: NewPromptForm = {
          title: entry.title,
          goal: entry.goal,
          scene: entry.scene,
          goalClusters: entry.goalClusters,
          modelUsed: entry.model,
          customModel: '',
          promptContent: entry.prompt,
        };

        const model = form.modelUsed || 'GPT-4o';
        const now = new Date().toISOString();

        let record: PromptRecord;

        if (supabase && user) {
          try {
            record = await db.createPrompt(supabase, user.id, form);
          } catch (err) {
            console.error('batch import item failed:', err);
            continue;
          }
        } else {
          record = {
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            title: form.title,
            goal: form.goal,
            modelUsed: model,
            scene: form.scene,
            goalClusters: form.goalClusters,
            images: [],
            currentVer: 1,
            versions: [
              { ver: 1, content: form.promptContent, effect: null, isStarred: false, updatedAt: now, changeNote: '导入' },
            ],
            createdAt: now,
            updatedAt: now,
          };
        }

        if (entry.score) {
          const effect: VersionEffect = { score: entry.score, outputContent: '', notes: '' };
          if (supabase) {
            try {
              await db.saveEffect(supabase, record.id, 1, effect);
            } catch { /* non-critical */ }
          }
          record = {
            ...record,
            versions: record.versions.map((v) => v.ver === 1 ? { ...v, effect } : v),
          };
        }

        setAllPrompts((prev) => [record, ...prev]);
      }

      const firstEntry = entries[0];
      if (firstEntry) {
        setActiveScene(firstEntry.scene);
      }
    },
    [user, supabase],
  );

  return {
    prompts: filteredPrompts,
    allPrompts,
    loading,
    selectedPrompt,
    currentVersion,
    starredVersion,
    previewVersion,
    activeScene,
    isEditing,
    editForm,
    isHistoryExpanded,
    searchQuery,
    sortBy,
    previewingVer,
    showNewModal,
    effectTarget,
    showForkDialog,

    setIsHistoryExpanded,
    setSearchQuery,
    setSortBy,
    setShowNewModal,
    setShowForkDialog,
    setEditForm,
    setPreviewingVer,
    setEffectTarget,

    selectPrompt,
    changeScene,
    createPrompt,
    startEditing,
    cancelEditing,
    saveEditing,
    forkNewVersion,
    saveEffect,
    toggleStarVersion,
    openEffectModal,
    batchImport,
    removePrompt,
  };
}
