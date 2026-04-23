'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowRight, ArrowLeft, X, FileText, Type,
  Upload, Check, Star, AlertCircle, Loader2,
  Sparkles, Code2, GraduationCap, Briefcase, MoreHorizontal,
  ChevronDown, Trash2,
} from 'lucide-react';
import type { ImportEntry } from '@/lib/types';
import { CLUSTERS_BY_SCENE, AI_APPS, SCENE_LABELS } from '@/lib/constants';

const SCENE_LIST = [
  { id: 'coding', name: 'Vibe Coding', icon: Code2 },
  { id: 'academic', name: '学术写作', icon: GraduationCap },
  { id: 'pm', name: '产品经理', icon: Briefcase },
  { id: 'other', name: '其他', icon: MoreHorizontal },
];

const APP_NAMES = AI_APPS.map((a) => a.name);

const TEMPLATE_TEXT = `---
标题：生成响应式登录页
目标：用 React+Tailwind 生成现代风 SaaS 登录页
Prompt：你是一位精通前端设计的工程师...（正文）
模型：GPT-4o
评分：4
---
标题：润色论文摘要
目标：让摘要更简洁有力，符合学术规范
Prompt：请帮我润色以下学术论文摘要...（正文）
模型：Claude 3.7 Sonnet
评分：5
---`;

function parseImportText(text: string): ImportEntry[] {
  const blocks = text.split(/^---$/m).filter((b) => b.trim());
  const entries: ImportEntry[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const fields: Record<string, string> = {};

    let currentKey = '';
    let currentVal = '';

    for (const line of lines) {
      const match = line.match(/^(标题|目标|Prompt|模型|评分|场景)[：:]\s*(.*)/);
      if (match) {
        if (currentKey) fields[currentKey] = currentVal.trim();
        currentKey = match[1];
        currentVal = match[2];
      } else if (currentKey) {
        currentVal += '\n' + line;
      }
    }
    if (currentKey) fields[currentKey] = currentVal.trim();

    if (fields['标题'] && fields['Prompt']) {
      const scoreNum = parseInt(fields['评分'] || '', 10);
      entries.push({
        title: fields['标题'],
        goal: fields['目标'] || '',
        prompt: fields['Prompt'],
        model: fields['模型'] || 'GPT-4o',
        score: isNaN(scoreNum) ? null : Math.min(5, Math.max(1, scoreNum)),
        scene: '',
        goalClusters: [],
      });
    }
  }

  return entries;
}

function guessScene(entry: ImportEntry): string {
  const text = (entry.title + ' ' + entry.goal + ' ' + entry.prompt).toLowerCase();
  const codingKeywords = ['代码', 'code', 'react', 'vue', 'css', 'html', 'api', '前端', '后端', 'bug', 'debug', '组件', 'hook', '函数', 'function', 'typescript', 'tailwind', '页面', '登录'];
  const academicKeywords = ['论文', '摘要', '文献', '研究', '学术', '期刊', '润色', 'abstract', 'paper', 'research', '实验'];
  const pmKeywords = ['prd', '需求', '用户故事', '竞品', '产品', 'okr', '会议', '数据报告'];

  const codingScore = codingKeywords.filter((k) => text.includes(k)).length;
  const academicScore = academicKeywords.filter((k) => text.includes(k)).length;
  const pmScore = pmKeywords.filter((k) => text.includes(k)).length;

  if (codingScore >= academicScore && codingScore >= pmScore && codingScore > 0) return 'coding';
  if (academicScore >= codingScore && academicScore >= pmScore && academicScore > 0) return 'academic';
  if (pmScore > 0) return 'pm';
  return 'other';
}

function guessCluster(entry: ImportEntry, scene: string): string[] {
  const clusters = CLUSTERS_BY_SCENE[scene] ?? [];
  const text = (entry.title + ' ' + entry.goal).toLowerCase();
  const matched = clusters.filter((c) => text.includes(c.replace(/\s/g, '').toLowerCase()) || text.includes(c.toLowerCase()));
  return matched.length > 0 ? [matched[0]] : clusters.length > 0 ? [clusters[0]] : [];
}

interface Props {
  onComplete: (entries: ImportEntry[]) => Promise<void>;
  onSkip: () => void;
}

export default function ImportWizard({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [importMethod, setImportMethod] = useState<'batch' | 'manual' | null>(null);
  const [rawText, setRawText] = useState('');
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [importedScenes, setImportedScenes] = useState<string[]>([]);

  const parsedCount = useMemo(() => {
    if (!rawText.trim()) return 0;
    return parseImportText(rawText).length;
  }, [rawText]);

  const handleParse = () => {
    const parsed = parseImportText(rawText);
    const withGuess = parsed.map((e) => {
      const scene = guessScene(e);
      const clusters = guessCluster(e, scene);
      return { ...e, scene, goalClusters: clusters };
    });
    setEntries(withGuess);
    setStep(3);
  };

  const updateEntry = (idx: number, patch: Partial<ImportEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await onComplete(entries);
      const scenes = [...new Set(entries.map((e) => e.scene))];
      setImportedCount(entries.length);
      setImportedScenes(scenes);
      setStep(4);
    } catch {
      /* keep on current step */
    } finally {
      setImporting(false);
    }
  };

  const validEntries = entries.filter((e) => e.title && e.prompt && e.goalClusters.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/40 to-black/50 backdrop-blur-sm backdrop-enter" />
      <div className="relative bg-white rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.15)] w-[780px] max-w-[94vw] max-h-[90vh] flex flex-col overflow-hidden modal-enter">

        {/* Progress Bar */}
        {step < 4 && (
          <div className="h-1 bg-gray-100 shrink-0">
            <div
              className="h-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / 5) * 100}%` }}
            />
          </div>
        )}

        {/* ═══ Step 0 : Welcome ═══ */}
        {step === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 text-center">
            <div className="w-16 h-16 bg-gray-900 text-white rounded-2xl flex items-center justify-center font-bold text-3xl mb-8 shadow-lg">
              P
            </div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">
              欢迎来到 Promptory
            </h1>
            <p className="text-gray-500 text-lg leading-relaxed max-w-md mb-2">
              把你积累的 Prompt 搬进来，
              <br />
              Promptory 帮你整理成知识库
            </p>
            <p className="text-sm text-gray-400 mb-10">
              导入已有的 Prompt，或跳过直接开始使用
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setStep(1)}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl text-base font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
              >
                <Upload size={18} /> 开始导入
              </button>
              <button
                onClick={onSkip}
                className="px-6 py-3 text-gray-500 hover:text-gray-700 text-base font-medium transition-colors cursor-pointer"
              >
                跳过，直接使用
              </button>
            </div>
          </div>
        )}

        {/* ═══ Step 1 : Choose Method ═══ */}
        {step === 1 && (
          <div className="flex-1 flex flex-col px-10 py-8">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">选择导入方式</h2>
              <p className="text-sm text-gray-500 mt-1">推荐批量粘贴，可快速导入多条 Prompt</p>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1">
              <button
                onClick={() => { setImportMethod('batch'); setStep(2); }}
                className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 transition-all cursor-pointer group hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-md ${
                  importMethod === 'batch' ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <FileText size={28} className="text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-base mb-2">批量粘贴文本</h3>
                <p className="text-sm text-gray-500 text-center leading-relaxed">
                  按模板格式粘贴多条 Prompt，<br />系统自动解析并预览
                </p>
                <span className="mt-4 text-[10px] font-bold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full uppercase">推荐</span>
              </button>

              <button
                onClick={() => { setImportMethod('manual'); onSkip(); }}
                className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-gray-200 bg-white transition-all cursor-pointer group hover:border-gray-300 hover:shadow-md"
              >
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-gray-200 transition-colors">
                  <Type size={28} className="text-gray-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-base mb-2">逐条手动添加</h3>
                <p className="text-sm text-gray-500 text-center leading-relaxed">
                  进入主界面后，<br />使用新建按钮逐条录入
                </p>
              </button>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              <button onClick={() => setStep(0)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
                <ArrowLeft size={14} /> 返回
              </button>
              <p className="text-xs text-gray-400">Notion / CSV 导入将在后续版本支持</p>
            </div>
          </div>
        )}

        {/* ═══ Step 2 : Batch Paste ═══ */}
        {step === 2 && (
          <div className="flex-1 flex flex-col px-10 py-8 min-h-0">
            <div className="flex items-start justify-between mb-5 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">批量粘贴 Prompt</h2>
                <p className="text-sm text-gray-500 mt-1">
                  按以下格式粘贴，每条用 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">---</code> 分隔
                </p>
              </div>
              {parsedCount > 0 && (
                <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  识别到 {parsedCount} 条
                </span>
              )}
            </div>

            {/* Template Hint */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={14} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500">格式模板（必填：标题 + Prompt，其他选填）</span>
              </div>
              <pre className="text-xs text-gray-500 font-mono leading-relaxed whitespace-pre-wrap">{`---\n标题：你的 Prompt 标题\n目标：这次想达到什么效果\nPrompt：完整的 Prompt 正文...\n模型：GPT-4o\n评分：4\n---`}</pre>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={TEMPLATE_TEXT}
              className="flex-1 w-full px-5 py-4 border border-gray-200 rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none font-mono bg-white transition-all hover:border-gray-300 placeholder:text-gray-300 min-h-0"
            />

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
                <ArrowLeft size={14} /> 返回
              </button>
              <button
                onClick={handleParse}
                disabled={parsedCount === 0}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 cursor-pointer ${
                  parsedCount > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                解析并预览 <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══ Step 3 : Preview & Adjust ═══ */}
        {step === 3 && (
          <div className="flex-1 flex flex-col px-10 py-8 min-h-0">
            <div className="flex items-start justify-between mb-5 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">确认导入内容</h2>
                <p className="text-sm text-gray-500 mt-1">
                  共解析 {entries.length} 条，系统已自动推测场景和目标群，你可以逐条微调
                </p>
              </div>
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                validEntries.length === entries.length ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'
              }`}>
                {validEntries.length} / {entries.length} 条可导入
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
              {entries.map((entry, idx) => {
                const isEditing = editingIdx === idx;
                const hasIssue = !entry.goalClusters.length;
                return (
                  <div key={idx} className={`bg-white rounded-xl border transition-all ${isEditing ? 'border-blue-300 shadow-md' : hasIssue ? 'border-amber-300' : 'border-gray-200'}`}>
                    {/* Summary Row */}
                    <div
                      onClick={() => setEditingIdx(isEditing ? null : idx)}
                      className="flex items-center gap-4 px-5 py-4 cursor-pointer group"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${hasIssue ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{entry.title || '未命名'}</h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded">{SCENE_LABELS[entry.scene] || '未分类'}</span>
                          {entry.goalClusters.map((c) => (
                            <span key={c} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                          <span>{entry.model}</span>
                          {entry.score && (
                            <span className="flex items-center gap-0.5">
                              <Star size={10} fill="currentColor" className="text-amber-400" /> {entry.score}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); removeEntry(idx); }} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors cursor-pointer">
                          <Trash2 size={14} />
                        </button>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {/* Edit Panel */}
                    {isEditing && (
                      <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">标题</label>
                            <input type="text" value={entry.title} onChange={(e) => updateEntry(idx, { title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">模型</label>
                            <select value={entry.model} onChange={(e) => updateEntry(idx, { model: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white">
                              {APP_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
                              {!APP_NAMES.includes(entry.model) && <option value={entry.model}>{entry.model}</option>}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">目标</label>
                          <input type="text" value={entry.goal} onChange={(e) => updateEntry(idx, { goal: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">场景</label>
                          <div className="flex gap-2 flex-wrap">
                            {SCENE_LIST.map((s) => {
                              const Icon = s.icon;
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => {
                                    const newClusters = guessCluster(entry, s.id);
                                    updateEntry(idx, { scene: s.id, goalClusters: newClusters });
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                                    entry.scene === s.id ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                                  }`}
                                >
                                  <Icon size={12} /> {s.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            目标群 <span className="text-red-400">*</span>
                          </label>
                          <div className="flex gap-1.5 flex-wrap">
                            {(CLUSTERS_BY_SCENE[entry.scene] ?? []).map((c) => {
                              const sel = entry.goalClusters.includes(c);
                              return (
                                <button
                                  key={c}
                                  onClick={() => {
                                    const next = sel
                                      ? entry.goalClusters.filter((x) => x !== c)
                                      : entry.goalClusters.length < 3
                                        ? [...entry.goalClusters, c]
                                        : entry.goalClusters;
                                    updateEntry(idx, { goalClusters: next });
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                    sel ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                                  }`}
                                >
                                  {sel && <Check size={10} className="inline mr-1" />}{c}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Prompt 正文</label>
                          <textarea
                            value={entry.prompt}
                            onChange={(e) => updateEntry(idx, { prompt: e.target.value })}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">评分（选填）</label>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button
                                key={s}
                                onClick={() => updateEntry(idx, { score: entry.score === s ? null : s })}
                                className="cursor-pointer p-0.5"
                              >
                                <Star size={18} fill={entry.score && s <= entry.score ? 'currentColor' : 'none'} className={entry.score && s <= entry.score ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'} />
                              </button>
                            ))}
                            {entry.score && (
                              <button onClick={() => updateEntry(idx, { score: null })} className="text-xs text-gray-400 ml-2 cursor-pointer hover:text-gray-600">清除</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {entries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <p className="text-sm">没有解析到数据，请返回检查格式</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
                <ArrowLeft size={14} /> 返回修改
              </button>
              <button
                onClick={handleImport}
                disabled={validEntries.length === 0 || importing}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 cursor-pointer ${
                  validEntries.length > 0 && !importing
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {importing ? (
                  <><Loader2 size={14} className="animate-spin" /> 导入中...</>
                ) : (
                  <>导入 {validEntries.length} 条 <ArrowRight size={14} /></>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══ Step 4 : Done ═══ */}
        {step === 4 && (
          <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <Check size={32} className="text-green-600" strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">导入完成</h2>
            <p className="text-gray-500 text-base leading-relaxed mb-2">
              已成功导入 <span className="font-bold text-gray-900">{importedCount}</span> 条 Prompt
            </p>
            <p className="text-sm text-gray-400 mb-8">
              分布在 {importedScenes.map((s) => SCENE_LABELS[s] || s).join('、')} {importedScenes.length > 1 ? '等' : ''}{importedScenes.length} 个场景
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-400 mb-10">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-blue-500" />
                <span>继续积累可触发 Insight 分析</span>
              </div>
            </div>
            <button
              onClick={onSkip}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl text-base font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
            >
              进入 Promptory <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Close button */}
        {step < 4 && (
          <button
            onClick={onSkip}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer z-10"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
