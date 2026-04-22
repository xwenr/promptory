'use client';

import React, { useState, useEffect } from 'react';
import { Star, X, Zap, FileText, Plus } from 'lucide-react';
import type { VersionEffect } from '@/lib/types';
import { MODEL_GROUPS } from '@/lib/constants';

interface Props {
  promptTitle: string;
  ver: number;
  existingEffect: VersionEffect | null;
  currentModel: string;
  onSave: (effect: VersionEffect, modelUsed: string) => void;
  onClose: () => void;
}

export default function EffectModal({ promptTitle, ver, existingEffect, currentModel, onSave, onClose }: Props) {
  const [score, setScore] = useState(existingEffect?.score ?? 0);
  const [hoverStar, setHoverStar] = useState(0);
  const [mode, setMode] = useState<'quick' | 'full'>(existingEffect?.outputContent ? 'full' : 'quick');
  const [outputContent, setOutputContent] = useState(existingEffect?.outputContent ?? '');
  const [notes, setNotes] = useState(existingEffect?.notes ?? '');
  const [modelUsed, setModelUsed] = useState(currentModel || '');
  const [activeProvider, setActiveProvider] = useState<string | null>(() => {
    if (!currentModel) return null;
    const found = MODEL_GROUPS.find((g) => g.models.includes(currentModel));
    return found?.provider ?? null;
  });
  const [showCustomModel, setShowCustomModel] = useState(false);
  const [customModelName, setCustomModelName] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = () => {
    const finalModel = showCustomModel ? customModelName.trim() : modelUsed;
    onSave(
      {
        score: score || 3,
        outputContent: mode === 'full' ? outputContent : '',
        notes: mode === 'full' ? notes : '',
      },
      finalModel || modelUsed,
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] backdrop-enter" onClick={onClose} />

      <div className="relative bg-surface-raised rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.12)] w-[560px] max-w-[92vw] max-h-[85vh] flex flex-col overflow-hidden modal-enter">
        {/* Header */}
        <div className="px-7 pt-5 pb-4 border-b border-edge-light flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-lg font-bold text-ink">记录效果</h2>
            <p className="text-[13px] text-ink-muted mt-1 truncate max-w-[400px]">
              为「{promptTitle}」v{ver} 补充效果
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 -mt-1 text-ink-muted hover:text-ink-secondary hover:bg-surface-inset rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
          {/* AI Model Selection — Two-level */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2.5">
              使用的 AI 模型 <span className="text-red-400 text-xs">*</span>
            </label>
            {/* Level 1: Provider */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {MODEL_GROUPS.map((g) => {
                const isActive = activeProvider === g.provider && !showCustomModel;
                return (
                  <button
                    key={g.provider}
                    onClick={() => {
                      setActiveProvider(isActive ? null : g.provider);
                      setShowCustomModel(false);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                        : 'bg-surface-raised text-ink-secondary border border-edge hover:border-gray-300 dark:hover:border-gray-600 hover:bg-surface-inset'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white dark:bg-gray-900' : g.color}`} />
                    {g.provider}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setShowCustomModel(!showCustomModel);
                  setActiveProvider(null);
                  if (!showCustomModel) setModelUsed('');
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  showCustomModel
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                    : 'bg-surface-raised text-ink-secondary border border-edge border-dashed hover:border-gray-300 dark:hover:border-gray-600 hover:bg-surface-inset'
                }`}
              >
                <Plus size={12} /> 其他
              </button>
            </div>
            {/* Level 2: Specific model under selected provider */}
            {activeProvider && !showCustomModel && (() => {
              const group = MODEL_GROUPS.find((g) => g.provider === activeProvider);
              if (!group) return null;
              return (
                <div className="flex flex-wrap gap-1.5 pl-3 py-1 bg-surface-inset/50 rounded-lg ml-1.5">
                  {group.models.map((m) => (
                    <button
                      key={m}
                      onClick={() => setModelUsed(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        modelUsed === m
                          ? `text-white shadow-sm ${group.color.replace('bg-', 'bg-')}`
                          : 'bg-surface-inset text-ink-secondary hover:bg-surface-raised'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              );
            })()}
            {showCustomModel && (
              <input
                type="text"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                placeholder="输入模型名称，如 Llama 3..."
                className="mt-1 w-full px-4 py-2 border border-edge rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-400 dark:focus:border-blue-600 transition-colors placeholder:text-ink-muted hover:border-gray-300 dark:hover:border-gray-600"
                autoFocus
              />
            )}
          </div>

          {/* Star Rating */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-3">
              效果评分 <span className="text-red-400 text-xs">*</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onMouseEnter={() => setHoverStar(s)}
                  onMouseLeave={() => setHoverStar(0)}
                  onClick={() => setScore(s === score ? 0 : s)}
                  className="p-0.5 transition-transform hover:scale-110 cursor-pointer"
                >
                  <Star
                    size={28}
                    className={`transition-colors ${s <= (hoverStar || score) ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700'}`}
                    fill={s <= (hoverStar || score) ? 'currentColor' : 'none'}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
              {score > 0 && <span className="ml-2 text-sm text-ink-secondary font-medium">{score} 星</span>}
            </div>
          </div>

          {/* Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2.5">记录档位</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('quick')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  mode === 'quick'
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                    : 'bg-surface-inset text-ink-secondary border border-edge hover:bg-surface-raised'
                }`}
              >
                <Zap size={16} /> 快速档
                <span className="text-xs opacity-70">30 秒搞定</span>
              </button>
              <button
                onClick={() => setMode('full')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  mode === 'full'
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                    : 'bg-surface-inset text-ink-secondary border border-edge hover:bg-surface-raised'
                }`}
              >
                <FileText size={16} /> 完整档
                <span className="text-xs opacity-70">详细记录</span>
              </button>
            </div>
          </div>

          {mode === 'full' && (
            <>
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-1.5">AI 输出内容</label>
                <textarea
                  value={outputContent}
                  onChange={(e) => setOutputContent(e.target.value)}
                  placeholder="粘贴真实的 AI 输出结果..."
                  className="w-full h-40 px-4 py-3 border border-edge rounded-xl text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-400 dark:focus:border-blue-600 resize-none font-mono bg-surface-inset/50 transition-colors hover:border-gray-300 dark:hover:border-gray-600 placeholder:text-ink-muted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-1.5">补充备注</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="记录一些观察和心得，例如：这次加了风格约束后效果明显更好..."
                  className="w-full h-24 px-4 py-3 border border-edge rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 focus:border-blue-400 dark:focus:border-blue-600 resize-none transition-colors hover:border-gray-300 dark:hover:border-gray-600 placeholder:text-ink-muted"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 bg-surface-inset/80 border-t border-edge-light flex items-center justify-between shrink-0">
          <button onClick={onClose} className="text-sm text-ink-secondary hover:text-ink font-medium transition-colors cursor-pointer">
            跳过，稍后补充
          </button>
          <button
            onClick={handleSave}
            disabled={score === 0 || (!modelUsed && !showCustomModel) || (showCustomModel && !customModelName.trim())}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm cursor-pointer ${
              score > 0 && (modelUsed || (showCustomModel && customModelName.trim()))
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'
                : 'bg-gray-200 dark:bg-gray-700 text-ink-muted cursor-not-allowed'
            }`}
          >
            保存效果
          </button>
        </div>
      </div>
    </div>
  );
}
