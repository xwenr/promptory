'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Code2, GraduationCap, Briefcase, Search, Plus,
  Edit3, Star, Clock, Sparkles, MoreHorizontal, Copy, Check, GitFork,
  ChevronUp, ChevronDown, ChevronRight, X, Loader2, ArrowUpDown,
} from 'lucide-react';
import { usePromptStore } from '@/hooks/usePromptStore';
import { CLUSTERS_BY_SCENE, MODEL_GROUPS, formatDate, formatDateTime } from '@/lib/constants';
import type { PromptRecord, ImportEntry } from '@/lib/types';
import EffectModal from '@/components/EffectModal';
import ImportWizard from '@/components/ImportWizard';
import NewPromptModal from '@/components/NewPromptModal';
import { HighlightDisplay } from '@/components/HighlightEditor';
import HighlightEditor from '@/components/HighlightEditor';
import ImageUpload from '@/components/ImageUpload';
import Stars from '@/components/Stars';
import { Trash2, ImagePlus } from 'lucide-react';

const SCENE_LIST = [
  { id: 'pm', name: '产品经理', icon: Briefcase },
  { id: 'coding', name: 'Vibe Coding', icon: Code2 },
  { id: 'academic', name: '学术写作', icon: GraduationCap },
  { id: 'other', name: '其他', icon: MoreHorizontal },
];

/* ── Memo'd list item to prevent re-renders ── */

const PromptListItem = React.memo(function PromptListItem({
  prompt,
  active,
  onSelect,
}: {
  prompt: PromptRecord;
  active: boolean;
  onSelect: () => void;
}) {
  const best = prompt.versions.find((v) => v.isStarred) ?? prompt.versions[prompt.versions.length - 1];
  const score = best?.effect?.score ?? 0;
  const showModel = prompt.modelUsed && prompt.modelUsed !== '待选择';

  return (
    <div
      onClick={onSelect}
      className={`px-4 py-3 rounded-lg cursor-pointer transition-all ${
        active
          ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-gray-200/80'
          : 'hover:bg-white/70'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <h3 className={`text-[13px] font-semibold truncate pr-2 ${active ? 'text-gray-900' : 'text-gray-600'}`}>
          {prompt.title}
        </h3>
        <span className={`text-[11px] shrink-0 tabular-nums ${active ? 'text-gray-500' : 'text-gray-400'}`}>
          {formatDate(prompt.updatedAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {prompt.goalClusters.slice(0, 1).map((c) => (
            <span
              key={c}
              className={`px-1.5 py-[1px] rounded text-[11px] font-medium truncate ${
                active
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {c}
            </span>
          ))}
          {showModel && (
            <span className="text-[11px] text-gray-400 truncate">
              {prompt.modelUsed}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Stars score={score} size={10} />
          <span className="text-[11px] text-gray-400">v{prompt.currentVer}</span>
        </div>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */

export default function Home() {
  const store = usePromptStore();
  const { selectedPrompt: sp, currentVersion: cv, previewVersion: pv } = store;

  const [forkNote, setForkNote] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [showClusterConfirm, setShowClusterConfirm] = useState(false);
  const [showClusterDropdown, setShowClusterDropdown] = useState(false);
  const [clusterSearchEdit, setClusterSearchEdit] = useState('');
  const [showNewClusterEdit, setShowNewClusterEdit] = useState(false);
  const [newClusterNameEdit, setNewClusterNameEdit] = useState('');
  const [customClustersEdit, setCustomClustersEdit] = useState<string[]>([]);
  const [editNewImageFiles, setEditNewImageFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!store.loading && store.allPrompts.length === 0 && !wizardDismissed && !store.showNewModal) {
      setShowImportWizard(true);
    }
  }, [store.loading, store.allPrompts.length, wizardDismissed, store.showNewModal]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleImportComplete = useCallback(
    async (entries: ImportEntry[]) => {
      await store.batchImport(entries);
    },
    [store.batchImport],
  );

  const handleImportSkip = useCallback(() => {
    setShowImportWizard(false);
    setWizardDismissed(true);
  }, []);

  const editClusters = useMemo(() => {
    if (!sp || !store.isEditing) return [];
    const scene = sp.scene;
    const defaults = CLUSTERS_BY_SCENE[scene] ?? [];
    const saved = new Set<string>();
    store.allPrompts
      .filter((p) => p.scene === scene)
      .forEach((p) => p.goalClusters.forEach((c) => saved.add(c)));
    const all = new Set([...defaults, ...Array.from(saved), ...customClustersEdit]);
    return Array.from(all);
  }, [sp, store.isEditing, store.allPrompts, customClustersEdit]);

  const filteredEditClusters = useMemo(
    () =>
      clusterSearchEdit
        ? editClusters.filter((c) => c.toLowerCase().includes(clusterSearchEdit.toLowerCase()))
        : editClusters,
    [editClusters, clusterSearchEdit],
  );

  const toggleEditCluster = useCallback(
    (c: string) => {
      store.setEditForm((f) => {
        if (!f) return f;
        const current = f.goalClusters;
        if (current.includes(c)) return { ...f, goalClusters: current.filter((x) => x !== c) };
        if (current.length >= 3) return f;
        return { ...f, goalClusters: [...current, c] };
      });
    },
    [store.setEditForm],
  );

  const addCustomClusterEdit = useCallback(() => {
    const name = newClusterNameEdit.trim();
    if (!name || editClusters.includes(name)) return;
    setCustomClustersEdit((prev) => [...prev, name]);
    store.setEditForm((f) => {
      if (!f || f.goalClusters.length >= 3) return f;
      return { ...f, goalClusters: [...f.goalClusters, name] };
    });
    setNewClusterNameEdit('');
    setShowNewClusterEdit(false);
  }, [newClusterNameEdit, editClusters, store.setEditForm]);

  const clustersChanged = useMemo(() => {
    if (!sp || !store.editForm) return false;
    const orig = [...sp.goalClusters].sort();
    const curr = [...store.editForm.goalClusters].sort();
    return orig.length !== curr.length || orig.some((v, i) => v !== curr[i]);
  }, [sp, store.editForm]);

  const doSave = useCallback(async () => {
    const files = editNewImageFiles.length > 0 ? editNewImageFiles : undefined;
    const err = await store.saveEditing(files);
    setEditNewImageFiles([]);
    if (err) {
      showToast(err);
    }
  }, [store.saveEditing, editNewImageFiles, showToast]);

  const handleSaveWithConfirm = useCallback(() => {
    setShowClusterDropdown(false);
    if (clustersChanged) {
      setShowClusterConfirm(true);
    } else {
      doSave();
    }
  }, [clustersChanged, doSave]);

  const confirmSave = useCallback(() => {
    setShowClusterConfirm(false);
    doSave();
  }, [doSave]);

  const insightCount = useMemo(
    () =>
      store.allPrompts.filter(
        (p) => p.scene === 'coding' && p.versions.some((v) => v.effect && v.effect.score >= 4),
      ).length,
    [store.allPrompts],
  );

  return (
    <div className="flex h-full w-full text-gray-800 font-sans overflow-hidden selection:bg-blue-100">
      {/* ──────── Column 2 : List Panel ──────── */}
      <div className="w-80 bg-[#F5F5F5] border-r border-gray-200 flex flex-col shrink-0 z-10">
        <div className="px-4 py-4 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {SCENE_LIST.map((s) => {
                const Icon = s.icon;
                const active = store.activeScene === s.id;
                const hasBadge = s.id === 'coding' && insightCount >= 3;
                return (
                  <button
                    key={s.id}
                    onClick={() => store.changeScene(s.id)}
                    title={s.name}
                    className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      active
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    <Icon size={14} strokeWidth={active ? 2.5 : 2} />
                    {active && <span className="truncate">{s.name}</span>}
                    {hasBadge && !active && (
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full border border-white" />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => store.setShowNewModal(true)}
              className="p-1.5 bg-white rounded-md border border-gray-200 shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 text-gray-600 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索标题、目标、内容..."
                value={store.searchQuery}
                onChange={(e) => store.setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-colors placeholder:text-gray-400 shadow-sm"
              />
            </div>
            <div className="relative group">
              <button className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors shadow-sm cursor-pointer">
                <ArrowUpDown size={14} />
              </button>
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[120px]">
                {([['recent', '最近使用'], ['score', '评分最高'], ['versions', '版本最多']] as const).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      onClick={() => store.setSortBy(key)}
                      className={`w-full px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                        store.sortBy === key
                          ? 'text-blue-600 font-medium bg-blue-50'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
          {store.activeScene === 'coding' && insightCount >= 3 && (
            <Link
              href="/insight"
              className="bg-blue-50/70 border border-blue-100/80 rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors group relative overflow-hidden block"
            >
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Sparkles size={40} />
              </div>
              <div className="flex items-center gap-2 text-blue-700 mb-1 relative z-10">
                <Sparkles size={14} className="text-blue-500" />
                <span className="text-sm font-medium">Insight 可提炼</span>
              </div>
              <p className="text-xs text-blue-600/70 relative z-10">
                「前端页面生成」已积累 {insightCount} 条高分记录，点击查看分析报告。
              </p>
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-12 flex flex-col gap-0.5">
          {store.loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-gray-400 mb-2" />
              <p className="text-sm text-gray-400">加载中...</p>
            </div>
          ) : store.prompts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <p className="text-sm font-medium text-gray-500 mb-1">暂无 Prompt 记录</p>
              <button onClick={() => store.setShowNewModal(true)} className="mt-2 text-blue-600 text-sm font-medium cursor-pointer">
                新建一条
              </button>
            </div>
          ) : (
            store.prompts.map((p) => (
              <PromptListItem
                key={p.id}
                prompt={p}
                active={p.id === sp?.id}
                onSelect={() => store.selectPrompt(p.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ──────── Column 3 : Detail View ──────── */}
      <div className="flex-1 bg-white flex flex-col overflow-y-auto relative min-w-0">
        {sp && cv ? (
          <div className="max-w-3xl w-full mx-auto px-8 lg:px-12 pt-10 pb-32 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div className="flex-1 pr-8">
                {store.isEditing ? (
                  <input
                    type="text"
                    value={store.editForm?.title ?? ''}
                    onChange={(e) => store.setEditForm((f) => (f ? { ...f, title: e.target.value } : f))}
                    className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-500 focus:outline-none pb-1 bg-transparent placeholder-gray-300"
                    placeholder="输入 Prompt 标题..."
                  />
                ) : (
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight leading-snug">{sp.title}</h2>
                )}
                <p className="text-sm text-gray-400 mt-2 flex items-center gap-2">
                  <Clock size={14} /> 更新于 {formatDateTime(sp.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {store.isEditing ? (
                  <>
                    <button onClick={() => { store.cancelEditing(); setEditNewImageFiles([]); }} className="px-3.5 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer">
                      取消
                    </button>
                    <button onClick={handleSaveWithConfirm} className="px-3.5 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-blue-200 flex items-center gap-1.5 cursor-pointer">
                      <Check size={16} /> 保存修改
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={store.startEditing} className="px-3.5 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer">
                      <Edit3 size={16} /> 编辑
                    </button>
                    <button
                      onClick={() => {
                        setForkNote('');
                        store.setShowForkDialog(true);
                      }}
                      className="px-3.5 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <GitFork size={16} /> Fork
                    </button>
                    <div className="relative group">
                      <button className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
                        <MoreHorizontal size={18} />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[140px]">
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="w-full px-3 py-2 text-xs text-left text-red-600 hover:bg-red-50 transition-colors cursor-pointer flex items-center gap-2"
                        >
                          <Trash2 size={12} /> 删除此 Prompt
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pb-8 mb-8 border-b border-gray-100 text-sm relative z-20">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">目标描述 Goal</span>
                {store.isEditing ? (
                  <input
                    type="text"
                    value={store.editForm?.goal ?? ''}
                    onChange={(e) => store.setEditForm((f) => (f ? { ...f, goal: e.target.value } : f))}
                    className="w-full text-sm text-gray-700 border-b border-gray-300 focus:border-blue-500 focus:outline-none pb-0.5 bg-transparent"
                  />
                ) : (
                  <span className="text-gray-700 font-medium">{sp.goal}</span>
                )}
              </div>
              <div className="w-px h-8 bg-gray-200 hidden md:block" />
              <div className="flex flex-col gap-1.5 shrink-0 relative">
                <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">目标群 Cluster</span>
                {store.isEditing ? (
                  <div>
                    <button
                      onClick={() => { setShowClusterDropdown(!showClusterDropdown); setClusterSearchEdit(''); }}
                      className="flex items-center gap-1.5 flex-wrap cursor-pointer group"
                    >
                      {(store.editForm?.goalClusters ?? []).map((c) => (
                        <span key={c} className="bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-md font-medium inline-flex items-center gap-1 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {c}
                        </span>
                      ))}
                      <span className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors flex items-center gap-0.5">
                        <Edit3 size={11} /> 修改
                      </span>
                    </button>
                    {showClusterDropdown && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowClusterDropdown(false)} />
                        <div className="absolute top-full left-0 mt-2 z-40 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-200 w-[320px] p-3">
                          <div className="flex items-center justify-between mb-2.5">
                            <span className="text-xs font-semibold text-gray-700">选择目标群</span>
                            <span className="text-[11px] text-gray-400">{store.editForm?.goalClusters.length ?? 0}/3</span>
                          </div>
                          <div className="relative mb-2.5">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              placeholder="搜索..."
                              value={clusterSearchEdit}
                              onChange={(e) => setClusterSearchEdit(e.target.value)}
                              className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-colors placeholder:text-gray-400"
                              autoFocus
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto mb-2.5">
                            {filteredEditClusters.map((c) => {
                              const sel = store.editForm?.goalClusters.includes(c) ?? false;
                              const dis = !sel && (store.editForm?.goalClusters.length ?? 0) >= 3;
                              return (
                                <button
                                  key={c}
                                  onClick={() => !dis && toggleEditCluster(c)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    sel
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : dis
                                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                        : 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 cursor-pointer'
                                  }`}
                                >
                                  {sel && <Check size={10} strokeWidth={3} />} {c}
                                </button>
                              );
                            })}
                            {filteredEditClusters.length === 0 && (
                              <p className="text-xs text-gray-400 py-1">没有匹配的目标群</p>
                            )}
                          </div>
                          <div className="border-t border-gray-100 pt-2">
                            {showNewClusterEdit ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={newClusterNameEdit}
                                  onChange={(e) => setNewClusterNameEdit(e.target.value)}
                                  placeholder="输入名称..."
                                  className="flex-1 px-2.5 py-1 bg-gray-50 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') addCustomClusterEdit();
                                    if (e.key === 'Escape') setShowNewClusterEdit(false);
                                  }}
                                />
                                <button onClick={addCustomClusterEdit} disabled={!newClusterNameEdit.trim()} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 cursor-pointer">
                                  添加
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setShowNewClusterEdit(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors cursor-pointer">
                                <Plus size={12} /> 新建目标群
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    {sp.goalClusters.map((c) => (
                      <span key={c} className="bg-blue-50/50 border border-blue-100 text-blue-700 px-2.5 py-0.5 rounded-md font-medium inline-flex items-center gap-1 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Prompt Body */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Prompt 正文</span>
                {!store.isEditing && (
                  <button
                    onClick={() => navigator.clipboard.writeText(cv.content)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    <Copy size={12} /> 复制
                  </button>
                )}
              </div>
              {store.isEditing ? (
                <HighlightEditor
                  value={store.editForm?.content ?? ''}
                  onChange={(val) => store.setEditForm((f) => (f ? { ...f, content: val } : f))}
                  placeholder="输入 Prompt 内容..."
                />
              ) : (
                <HighlightDisplay
                  content={cv.content}
                  className="bg-[#F9FAFB] border border-gray-200/60 rounded-xl p-6 text-[15px] leading-relaxed text-gray-700 whitespace-pre-wrap font-mono shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                />
              )}
            </div>

            {/* Note */}
            {store.isEditing ? (
              <div className="mb-8">
                <label className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider block mb-2.5">备注</label>
                <textarea
                  value={store.editForm?.changeNote ?? ''}
                  onChange={(e) => store.setEditForm((f) => (f ? { ...f, changeNote: e.target.value } : f))}
                  placeholder="记录这个版本的设计思路、注意事项..."
                  className="w-full h-20 px-4 py-3 border border-gray-200 rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none transition-colors hover:border-gray-300 placeholder:text-gray-400 bg-gray-50/50"
                />
              </div>
            ) : (
              cv.changeNote && !['初始版本', '导入'].includes(cv.changeNote) && (
                <div className="mb-8">
                  <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">备注</span>
                  <p className="mt-2.5 text-sm text-gray-600 leading-relaxed bg-amber-50/60 border border-amber-100/80 rounded-xl px-5 py-3.5">
                    {cv.changeNote}
                  </p>
                </div>
              )
            )}

            {/* Images */}
            {store.isEditing ? (
              <div className="mb-8">
                <label className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider block mb-2.5">参考图片</label>
                {(store.editForm?.images ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-3">
                    {(store.editForm?.images ?? []).map((url, i) => (
                      <div key={i} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        <img
                          src={url}
                          alt={`图 ${i + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <button
                          type="button"
                          onClick={() => store.setEditForm((f) => f ? { ...f, images: f.images.filter((_, idx) => idx !== i) } : f)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <X size={10} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ImageUpload
                  files={editNewImageFiles}
                  onChange={setEditNewImageFiles}
                  maxFiles={5 - (store.editForm?.images.length ?? 0)}
                />
              </div>
            ) : sp.images && sp.images.length > 0 ? (
              <div className="mb-8">
                <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">参考图片</span>
                <div className="flex flex-wrap gap-3 mt-2.5">
                  {sp.images.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-32 h-32 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 hover:border-blue-300 hover:shadow-md transition-all group"
                    >
                      <img
                        src={url}
                        alt={`参考图 ${i + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = 'none';
                          el.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-400 text-xs">加载失败</div>';
                        }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-lg font-medium text-gray-500 mb-2">暂无 Prompt</p>
            <p className="text-sm mb-4">新建一条记录，或导入已有的 Prompt</p>
            <div className="flex items-center gap-3">
              <button onClick={() => store.setShowNewModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer">
                新建 Prompt
              </button>
              <button onClick={() => setShowImportWizard(true)} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer">
                批量导入
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ──────── Column 4 : Preview & History ──────── */}
      <div className="w-[380px] bg-[#FAFAFA] border-l border-gray-200 flex flex-col shrink-0 z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.02)] relative">
        {sp ? (
          <>
            {/* Preview */}
            <div className="flex-1 flex flex-col min-h-0 bg-white relative z-0">
              <div className="px-5 py-4 flex items-center justify-between bg-white/80 backdrop-blur-md z-10 shrink-0 border-b border-gray-100 sticky top-0">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  效果预览
                  <span className="text-[11px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200/60">
                    v{pv?.ver}
                  </span>
                  {store.previewingVer !== null && store.previewingVer !== sp.currentVer && (
                    <button onClick={() => store.setPreviewingVer(null)} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer">
                      回到最新
                    </button>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  {pv?.effect && <Stars score={pv.effect.score} size={14} />}
                  <button
                    onClick={() => pv && store.openEffectModal(sp.id, pv.ver)}
                    className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
                    title="编辑效果"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 pb-20">
                {/* Model indicator */}
                {sp.modelUsed && sp.modelUsed !== '待选择' && (() => {
                  const group = MODEL_GROUPS.find((g) => g.models.includes(sp.modelUsed));
                  return (
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-gray-50 rounded-lg">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${group?.color ?? 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-500">
                        {group?.provider && <span className="font-medium text-gray-700">{group.provider}</span>}
                        {group?.provider && <span className="mx-1 text-gray-300">/</span>}
                        <span className="text-gray-600">{sp.modelUsed}</span>
                      </span>
                    </div>
                  );
                })()}
                {pv?.effect ? (
                  <>
                    <div className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">AI 输出记录</div>
                    {pv.effect.outputContent ? (
                      <div className="bg-[#1E1E1E] text-gray-300 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed shadow-sm">
                        <div className="flex gap-1.5 mb-3 border-b border-gray-700/50 pb-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                        </div>
                        <pre className="whitespace-pre-wrap m-0 font-inherit">{pv.effect.outputContent}</pre>
                      </div>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-6 text-sm text-gray-500 text-center">
                        快速档记录 · 仅评分，无 AI 输出内容
                      </div>
                    )}
                    {pv.effect.notes && (
                      <div className="mt-6 text-sm">
                        <div className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">效果备注</div>
                        <p className="text-gray-700 bg-amber-50/50 p-3.5 rounded-lg border border-amber-100/60 leading-relaxed text-sm">
                          {pv.effect.notes}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Star size={20} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500 mb-1">尚未记录效果</p>
                    <p className="text-xs text-gray-400 mb-4 text-center leading-relaxed">
                      使用后回来评分
                      <br />
                      持续积累有助于 Insight 分析
                    </p>
                    <button
                      onClick={() => pv && store.openEffectModal(sp.id, pv.ver)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                    >
                      补充效果
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Version History Drawer */}
            <div
              className={`flex flex-col bg-[#F9FAFB] border-t border-gray-200 transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)] z-20 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] ${
                store.isHistoryExpanded ? 'h-[60%]' : 'h-[52px]'
              }`}
            >
              <div
                onClick={() => store.setIsHistoryExpanded(!store.isHistoryExpanded)}
                className="px-5 h-[52px] shrink-0 flex justify-between items-center cursor-pointer hover:bg-gray-100/80 transition-colors group select-none"
              >
                <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} /> 版本历史{' '}
                  <span className="normal-case text-gray-400 font-normal ml-1">· {sp.versions.length} 个版本</span>
                </h3>
                <button
                  className={`text-gray-400 group-hover:text-gray-600 transition-colors p-1 bg-white border border-gray-200 rounded shadow-sm ${
                    store.isHistoryExpanded ? 'bg-gray-100' : ''
                  }`}
                >
                  {store.isHistoryExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>

              <div
                className={`flex-1 overflow-y-auto px-5 pb-6 transition-opacity duration-200 ${
                  store.isHistoryExpanded ? 'opacity-100 delay-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <div className="relative border-l-2 border-gray-200 ml-3 flex flex-col gap-6 pt-2">
                  {[...sp.versions].reverse().map((v) => {
                    const isCurrent = v.ver === sp.currentVer;
                    const isPreviewing =
                      store.previewingVer === v.ver || (store.previewingVer === null && isCurrent);
                    return (
                      <div
                        key={v.ver}
                        onClick={() => store.setPreviewingVer(isCurrent ? null : v.ver)}
                        className={`relative pl-6 cursor-pointer group transition-opacity ${
                          isCurrent ? '' : isPreviewing ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div
                          className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white transition-colors ${
                            isCurrent
                              ? 'border-[3px] border-blue-500 shadow-[0_0_0_2px_rgba(255,255,255,1)]'
                              : 'border-2 border-gray-300 group-hover:border-gray-400'
                          }`}
                        />
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`${
                              isCurrent
                                ? 'font-semibold text-gray-900'
                                : 'font-medium text-gray-700 group-hover:text-gray-900'
                            } text-sm flex items-center gap-1.5 transition-colors`}
                          >
                            v{v.ver}
                            {isCurrent && (
                              <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase">
                                当前
                              </span>
                            )}
                            {isPreviewing && !isCurrent && (
                              <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                预览中
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                store.toggleStarVersion(v.ver);
                              }}
                              className={`transition-colors ${
                                v.isStarred
                                  ? 'text-amber-400'
                                  : 'text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                              }`}
                              title={v.isStarred ? '取消代表作' : '设为代表作'}
                            >
                              <Star size={14} fill={v.isStarred ? 'currentColor' : 'none'} />
                            </button>
                          </span>
                          <span className="text-xs text-gray-400">{formatDateTime(v.updatedAt)}</span>
                        </div>
                        {v.effect && (
                          <div className="mb-2.5">
                            <Stars score={v.effect.score} size={11} />
                          </div>
                        )}
                        {!v.effect && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              store.openEffectModal(sp.id, v.ver);
                            }}
                            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium mb-2.5 cursor-pointer"
                          >
                            + 补充效果
                          </button>
                        )}
                        {v.changeNote && (
                          <p
                            className={`text-xs text-gray-500 leading-relaxed ${
                              isCurrent ? 'bg-white p-2.5 rounded border border-gray-100 shadow-sm' : ''
                            }`}
                          >
                            {v.changeNote}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            选择一条 Prompt 查看效果
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          NEW PROMPT MODAL (isolated component for performance)
          ═══════════════════════════════════════════════ */}
      {store.showNewModal && (
        <NewPromptModal
          activeScene={store.activeScene}
          allPrompts={store.allPrompts}
          onCreate={store.createPrompt}
          onOpenEffect={store.openEffectModal}
          onClose={() => store.setShowNewModal(false)}
          onToast={showToast}
        />
      )}

      {/* ═══════════════════════════════════════════════
          EFFECT MODAL (now includes model selection)
          ═══════════════════════════════════════════════ */}
      {store.effectTarget &&
        sp &&
        (() => {
          const ver = sp.versions.find((v) => v.ver === store.effectTarget!.ver);
          if (!ver) return null;
          return (
            <EffectModal
              promptTitle={sp.title}
              ver={ver.ver}
              existingEffect={ver.effect}
              currentModel={sp.modelUsed}
              onSave={(eff, modelUsed) =>
                store.saveEffect(store.effectTarget!.promptId, store.effectTarget!.ver, eff, modelUsed)
              }
              onClose={() => store.setEffectTarget(null)}
            />
          );
        })()}

      {/* ═══════════════════════════════════════════════
          IMPORT WIZARD
          ═══════════════════════════════════════════════ */}
      {showImportWizard && <ImportWizard onComplete={handleImportComplete} onSkip={handleImportSkip} />}

      {/* ═══════════════════════════════════════════════
          FORK DIALOG
          ═══════════════════════════════════════════════ */}
      {store.showForkDialog && sp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-enter" onClick={() => store.setShowForkDialog(false)} />
          <div className="relative bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] w-[440px] max-w-[90vw] p-6 modal-enter">
            <h3 className="text-base font-bold text-gray-900 mb-1">Fork 新版本</h3>
            <p className="text-sm text-gray-500 mb-4">
              基于 v{sp.currentVer} 创建 v{sp.currentVer + 1}，创建后将自动进入编辑模式
            </p>
            <input
              type="text"
              value={forkNote}
              onChange={(e) => setForkNote(e.target.value)}
              placeholder="版本说明（选填），例：增加了交互动效要求..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors placeholder:text-gray-400 hover:border-gray-300"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  store.forkNewVersion(forkNote);
                  setForkNote('');
                }
              }}
            />
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => {
                  store.setShowForkDialog(false);
                  setForkNote('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => {
                  store.forkNewVersion(forkNote);
                  setForkNote('');
                }}
                className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm cursor-pointer"
              >
                创建 v{sp.currentVer + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          DELETE CONFIRM DIALOG
          ═══════════════════════════════════════════════ */}
      {showDeleteConfirm && sp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-enter" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] w-[400px] max-w-[90vw] p-6 modal-enter">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Trash2 size={18} className="text-red-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">删除此 Prompt？</h3>
            <p className="text-sm text-gray-500 mb-5">
              「{sp.title}」及其所有版本和效果记录将被永久删除，此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                取消
              </button>
              <button
                onClick={async () => {
                  await store.removePrompt(sp.id);
                  setShowDeleteConfirm(false);
                  showToast('已删除');
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          CLUSTER CHANGE CONFIRM DIALOG
          ═══════════════════════════════════════════════ */}
      {showClusterConfirm && sp && store.editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-enter" onClick={() => setShowClusterConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] w-[440px] max-w-[90vw] p-6 modal-enter">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Edit3 size={18} className="text-amber-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">确认修改目标群？</h3>
            <p className="text-sm text-gray-500 mb-4">
              修改目标群会影响 Insight 分析的分组归类，请确认变更：
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-5 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-400 shrink-0 w-10 pt-0.5">原始</span>
                <div className="flex flex-wrap gap-1.5">
                  {sp.goalClusters.map((c) => (
                    <span key={c} className="px-2 py-0.5 bg-gray-200/80 text-gray-600 rounded text-xs font-medium">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-start gap-2">
                <span className="text-xs text-blue-500 shrink-0 w-10 pt-0.5 font-medium">修改为</span>
                <div className="flex flex-wrap gap-1.5">
                  {store.editForm.goalClusters.map((c) => {
                    const isNew = !sp.goalClusters.includes(c);
                    return (
                      <span key={c} className={`px-2 py-0.5 rounded text-xs font-medium ${isNew ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' : 'bg-gray-200/80 text-gray-600'}`}>
                        {c}{isNew && ' ✦'}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowClusterConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                取消
              </button>
              <button
                onClick={confirmSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
              >
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          TOAST
          ═══════════════════════════════════════════════ */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 modal-enter ${toast.includes('失败') ? 'bg-red-600' : 'bg-gray-900'}`}>
          {toast.includes('失败') ? <X size={16} /> : <Check size={16} className="text-green-400" />} {toast}
        </div>
      )}
    </div>
  );
}
