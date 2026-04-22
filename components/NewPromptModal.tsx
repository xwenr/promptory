'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Code2, GraduationCap, Briefcase, Search, Plus,
  Check, ChevronRight, X, MoreHorizontal,
} from 'lucide-react';
import { CLUSTERS_BY_SCENE, GOAL_PLACEHOLDERS } from '@/lib/constants';
import type { NewPromptForm, PromptRecord } from '@/lib/types';
import HighlightEditor from './HighlightEditor';
import ImageUpload from './ImageUpload';

const SCENE_LIST = [
  { id: 'pm', name: '产品经理', icon: Briefcase },
  { id: 'coding', name: 'Vibe Coding', icon: Code2 },
  { id: 'academic', name: '学术写作', icon: GraduationCap },
  { id: 'other', name: '其他', icon: MoreHorizontal },
];

interface Props {
  activeScene: string;
  allPrompts: PromptRecord[];
  onCreate: (form: NewPromptForm) => Promise<PromptRecord | null>;
  onOpenEffect: (promptId: string, ver: number) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export default function NewPromptModal({ activeScene, allPrompts, onCreate, onOpenEffect, onClose, onToast }: Props) {
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [modalScene, setModalScene] = useState(activeScene);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [newBody, setNewBody] = useState('');
  const [newNote, setNewNote] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [clusterSearch, setClusterSearch] = useState('');
  const [showNewCluster, setShowNewCluster] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [customClusters, setCustomClusters] = useState<Record<string, string[]>>({});

  const toggleCluster = useCallback((c: string) => {
    setSelectedClusters((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      return prev.length >= 3 ? prev : [...prev, c];
    });
  }, []);

  const isFormValid = useMemo(
    () => !!(newTitle.trim() && newGoal.trim() && selectedClusters.length >= 1 && newBody.trim()),
    [newTitle, newGoal, selectedClusters, newBody],
  );

  const savedClusters = useMemo(() => {
    const set = new Set<string>();
    allPrompts
      .filter((p) => p.scene === modalScene)
      .forEach((p) => p.goalClusters.forEach((c) => set.add(c)));
    return Array.from(set);
  }, [allPrompts, modalScene]);

  const curClusters = useMemo(() => {
    const defaults = CLUSTERS_BY_SCENE[modalScene] ?? [];
    const localNew = customClusters[modalScene] ?? [];
    const all = new Set([...defaults, ...savedClusters, ...localNew]);
    return Array.from(all);
  }, [modalScene, customClusters, savedClusters]);

  const filtClusters = useMemo(
    () =>
      clusterSearch
        ? curClusters.filter((c) => c.toLowerCase().includes(clusterSearch.toLowerCase()))
        : curClusters,
    [curClusters, clusterSearch],
  );

  const addCustomCluster = useCallback(() => {
    const name = newClusterName.trim();
    if (!name || curClusters.includes(name)) return;
    setCustomClusters((prev) => ({
      ...prev,
      [modalScene]: [...(prev[modalScene] ?? []), name],
    }));
    setSelectedClusters((prev) => (prev.length < 3 ? [...prev, name] : prev));
    setNewClusterName('');
    setShowNewCluster(false);
  }, [newClusterName, curClusters, modalScene]);

  const handleCreate = useCallback(
    async (withEffect: boolean) => {
      if (!isFormValid || submitting) return;
      setSubmitting(true);
      try {
        const form: NewPromptForm = {
          title: newTitle.trim(),
          goal: newGoal.trim(),
          scene: modalScene,
          goalClusters: selectedClusters,
          modelUsed: '',
          customModel: '',
          promptContent: newBody,
          note: newNote.trim() || undefined,
          imageFiles: imageFiles.length > 0 ? imageFiles : undefined,
        };
        const created = await onCreate(form);
        if (created) {
          if (imageFiles.length > 0 && (!created.images || created.images.length === 0)) {
            onToast('已保存，但图片上传失败 — 请检查网络或在编辑时重试');
          } else {
            onToast('已保存 — 目标越具体，Insight 分析越准确');
          }
          if (withEffect) onOpenEffect(created.id, 1);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [isFormValid, newTitle, newGoal, modalScene, selectedClusters, newBody, onCreate, onToast, onOpenEffect],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] backdrop-enter" onClick={onClose} />
      <div className="relative bg-surface-raised rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.12)] w-[720px] max-w-[92vw] max-h-[88vh] flex flex-col overflow-hidden modal-enter">
        {/* Header */}
        <div className="px-8 pt-6 pb-5 border-b border-edge-light flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-xl font-bold text-ink tracking-tight">新增 Prompt 记录</h2>
            <p className="text-[13px] text-ink-muted mt-1">填写完整信息有助于后续 Insight 规律提炼</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 -mt-1 text-ink-muted hover:text-ink-secondary hover:bg-surface-inset rounded-lg transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 space-y-8">
            {/* Section 1 — 基本信息 */}
            <section>
              <div className="flex items-center gap-2.5 mb-5">
                <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold ring-4 ring-blue-50/50 dark:ring-blue-900/20">1</span>
                <span className="text-xs font-semibold text-ink-secondary uppercase tracking-widest">基本信息</span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                    标题 <span className="text-red-400 text-xs">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="给这个 Prompt 起个清晰的名字..."
                    className="w-full px-4 py-2.5 border border-edge rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-400 dark:focus:border-blue-600 transition-colors placeholder:text-ink-muted hover:border-gray-300 dark:hover:border-gray-600"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                    目标描述 <span className="text-red-400 text-xs">*</span>
                  </label>
                  <input
                    type="text"
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    placeholder={GOAL_PLACEHOLDERS[modalScene]}
                    className="w-full px-4 py-2.5 border border-edge rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-400 dark:focus:border-blue-600 transition-colors placeholder:text-ink-muted hover:border-gray-300 dark:hover:border-gray-600"
                  />
                  <p className="mt-1.5 text-[11px] text-ink-muted">目标越具体，Insight 分析结果越准确</p>
                </div>
              </div>
            </section>

            <div className="border-t border-edge-light" />

            {/* Section 2 — 场景与分类 (AI model removed) */}
            <section>
              <div className="flex items-center gap-2.5 mb-5">
                <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold ring-4 ring-blue-50/50 dark:ring-blue-900/20">2</span>
                <span className="text-xs font-semibold text-ink-secondary uppercase tracking-widest">场景与分类</span>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ink-secondary mb-2.5">使用场景</label>
                  <div className="flex flex-wrap gap-2">
                    {SCENE_LIST.map((sc) => {
                      const Icon = sc.icon;
                      return (
                        <button
                          key={sc.id}
                          onClick={() => {
                            setModalScene(sc.id);
                            setSelectedClusters([]);
                            setClusterSearch('');
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                            modalScene === sc.id
                              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-lg shadow-gray-900/10'
                              : 'bg-surface-inset text-ink-secondary border border-edge hover:bg-surface-raised hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <Icon size={16} strokeWidth={modalScene === sc.id ? 2.5 : 2} /> {sc.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-sm font-medium text-ink-secondary">
                      目标群 <span className="text-red-400 text-xs">*</span>
                    </label>
                    <span className={`text-xs font-medium transition-colors ${selectedClusters.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-ink-muted'}`}>
                      已选 {selectedClusters.length} / 3
                    </span>
                  </div>
                  <div className="bg-surface-inset/80 rounded-xl border border-edge/80 p-4">
                    <div className="relative mb-3">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="text"
                        placeholder="搜索目标群..."
                        value={clusterSearch}
                        onChange={(e) => setClusterSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-surface-raised border border-edge rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-300 dark:focus:border-blue-600 transition-colors placeholder:text-ink-muted"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {filtClusters.map((c) => {
                        const sel = selectedClusters.includes(c);
                        const dis = !sel && selectedClusters.length >= 3;
                        return (
                          <button
                            key={c}
                            onClick={() => !dis && toggleCluster(c)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              sel
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                                : dis
                                  ? 'bg-surface-raised text-ink-muted border border-edge-light cursor-not-allowed'
                                  : 'bg-surface-raised text-ink-secondary border border-edge hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 cursor-pointer'
                            }`}
                          >
                            {sel && <Check size={12} strokeWidth={3} />} {c}
                          </button>
                        );
                      })}
                      {filtClusters.length === 0 && <p className="text-xs text-ink-muted py-2">没有匹配的目标群</p>}
                    </div>
                    {showNewCluster ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={newClusterName}
                          onChange={(e) => setNewClusterName(e.target.value)}
                          placeholder="输入目标群名称..."
                          className="flex-1 px-3 py-1.5 bg-surface-raised border border-blue-300 dark:border-blue-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addCustomCluster();
                            if (e.key === 'Escape') setShowNewCluster(false);
                          }}
                        />
                        <button onClick={addCustomCluster} disabled={!newClusterName.trim()} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 cursor-pointer">
                          添加
                        </button>
                        <button onClick={() => { setShowNewCluster(false); setNewClusterName(''); }} className="text-xs text-ink-muted hover:text-ink-secondary cursor-pointer">
                          取消
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setShowNewCluster(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors cursor-pointer">
                        <Plus size={12} /> 新建目标群
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="border-t border-edge-light" />

            {/* Section 3 — Prompt 正文 (with highlight editor) */}
            <section>
              <div className="flex items-center gap-2.5 mb-5">
                <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold ring-4 ring-blue-50/50 dark:ring-blue-900/20">3</span>
                <span className="text-xs font-semibold text-ink-secondary uppercase tracking-widest">Prompt 正文</span>
              </div>
              <HighlightEditor
                value={newBody}
                onChange={setNewBody}
                placeholder="在这里输入、粘贴你的 Prompt 模板..."
              />
              <div className="mt-5">
                <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                  备注 <span className="text-ink-muted text-xs font-normal">选填</span>
                </label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="记录这个 Prompt 的设计思路、适用场景或注意事项..."
                  className="w-full h-20 px-4 py-3 border border-edge rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-400 dark:focus:border-blue-600 resize-none transition-colors hover:border-gray-300 dark:hover:border-gray-600 placeholder:text-ink-muted bg-surface-inset/50"
                />
              </div>
              <div className="mt-5">
                <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                  参考图片 <span className="text-ink-muted text-xs font-normal">选填</span>
                </label>
                <p className="text-[11px] text-ink-muted mb-2.5">上传截图、设计稿等参考图，随 Prompt 一起发给 AI 引导输出效果</p>
                <ImageUpload files={imageFiles} onChange={setImageFiles} maxFiles={5} />
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-surface-inset/80 border-t border-edge-light flex items-center justify-between shrink-0">
          <p className="text-[11px] text-ink-muted">
            <span className="text-red-400">*</span> 为必填项 · AI 模型在补充效果时选择
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-ink-secondary bg-surface-raised border border-edge rounded-xl hover:bg-surface-inset hover:border-gray-300 dark:hover:border-gray-600 transition-colors shadow-sm cursor-pointer">
              取消
            </button>
            <button
              onClick={() => handleCreate(true)}
              disabled={!isFormValid || submitting}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer ${
                isFormValid && !submitting
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'
                  : 'bg-gray-200 dark:bg-gray-700 text-ink-muted cursor-not-allowed'
              }`}
            >
              {submitting ? '保存中...' : '保存并补充效果'} {!submitting && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
