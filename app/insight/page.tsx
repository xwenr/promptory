'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Check, X as XIcon, Copy, AlertCircle,
  Loader2, Code2, GraduationCap, Briefcase, MoreHorizontal,
  RefreshCw, Clock, ChevronRight, ArrowRight, ChevronDown, Trash2,
  Wand2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Stars from '@/components/Stars';
import { usePromptStore } from '@/hooks/usePromptStore';
import { CLUSTERS_BY_SCENE } from '@/lib/constants';
import { insightToTemplate, saveComposerTemplate } from '@/lib/composer';
import type { ClusterInsight, PromptRecord } from '@/lib/types';

const SCENE_TABS = [
  { id: 'coding', name: 'Vibe Coding', icon: Code2 },
  { id: 'academic', name: '学术写作', icon: GraduationCap },
  { id: 'pm', name: '产品经理', icon: Briefcase },
  { id: 'other', name: '其他', icon: MoreHorizontal },
];

const THRESHOLD = 5;
const MAX_HISTORY = 10;
const ARCHIVE_KEY = 'promptory-insight-archive';
const TEMPLATE_KEY = 'promptory-insight-template';

type InsightArchive = Record<string, ClusterInsight[]>;

interface ClusterStats {
  total: number;
  withScore: number;
  highScore: number;
  lowScore: number;
}

function computeClusterStats(
  prompts: PromptRecord[],
  scene: string,
  cluster: string,
): ClusterStats {
  const matched = prompts.filter(
    (p) => p.scene === scene && p.goalClusters.includes(cluster),
  );
  let withScore = 0, highScore = 0, lowScore = 0;
  for (const p of matched) {
    for (const v of p.versions) {
      if (v.effect?.score != null) {
        withScore++;
        if (v.effect.score >= 4) highScore++;
        if (v.effect.score <= 2) lowScore++;
      }
    }
  }
  return { total: matched.length, withScore, highScore, lowScore };
}

function ck(scene: string, cluster: string): string {
  return `${scene}::${cluster}`;
}

function loadArchive(): InsightArchive {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '{}');
    const result: InsightArchive = {};
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) {
        result[k] = v as ClusterInsight[];
      } else if (v && typeof v === 'object') {
        result[k] = [v as ClusterInsight];
      }
    }
    return result;
  } catch {
    return {};
  }
}

function persistArchive(archive: InsightArchive) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function InsightPage() {
  const router = useRouter();
  const { allPrompts, loading: storeLoading } = usePromptStore();

  const [activeScene, setActiveScene] = useState('coding');
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingIndex, setViewingIndex] = useState(0);

  const [insightCache, setInsightCache] = useState<InsightArchive>({});
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  useEffect(() => {
    const archived = loadArchive();
    if (Object.keys(archived).length > 0) setInsightCache(archived);
  }, []);

  useEffect(() => {
    if (confirmDeleteIdx === null) return;
    const t = setTimeout(() => setConfirmDeleteIdx(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteIdx]);

  const clusters = CLUSTERS_BY_SCENE[activeScene] ?? [];

  const statsByCluster = useMemo(() => {
    const map: Record<string, ClusterStats> = {};
    for (const c of clusters) {
      map[c] = computeClusterStats(allPrompts, activeScene, c);
    }
    return map;
  }, [allPrompts, activeScene, clusters]);

  const sortedClusters = useMemo(() => {
    return [...clusters].sort((a, b) => {
      const aHas = !!(insightCache[ck(activeScene, a)]?.length);
      const bHas = !!(insightCache[ck(activeScene, b)]?.length);
      if (aHas && !bHas) return -1;
      if (bHas && !aHas) return 1;
      const sa = statsByCluster[a] ?? { total: 0, highScore: 0 };
      const sb = statsByCluster[b] ?? { total: 0, highScore: 0 };
      if (sa.highScore >= 1 && sb.highScore === 0) return -1;
      if (sb.highScore >= 1 && sa.highScore === 0) return 1;
      return sb.total - sa.total;
    });
  }, [clusters, statsByCluster, activeScene, insightCache]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleDeleteEntry = useCallback((index: number) => {
    if (!activeCluster) return;
    const key = ck(activeScene, activeCluster);
    const currentLen = (insightCache[key] ?? []).length;

    setInsightCache((prev) => {
      const history = [...(prev[key] ?? [])];
      history.splice(index, 1);
      const next = { ...prev };
      if (history.length === 0) {
        delete next[key];
      } else {
        next[key] = history;
      }
      persistArchive(next);
      return next;
    });

    if (currentLen <= 1) {
      setActiveCluster(null);
      setViewingIndex(0);
    } else {
      setViewingIndex((prev) => {
        if (prev > index) return prev - 1;
        if (prev >= currentLen - 1) return currentLen - 2;
        return prev;
      });
    }
    setConfirmDeleteIdx(null);
    setShowHistory(false);
  }, [activeScene, activeCluster, insightCache]);

  const handleAnalyze = useCallback(async (cluster: string) => {
    const key = ck(activeScene, cluster);
    setActiveCluster(cluster);
    setAnalyzing((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setProgress(0);
    setProgressMsg('');

    try {
      const res = await fetch('/api/insight/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, scene: activeScene }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split('\n\n');
        buf = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          const evtMatch = block.match(/^event:\s*(.+)$/m);
          const dataMatch = block.match(/^data:\s*(.+)$/m);
          if (!evtMatch || !dataMatch) continue;

          const evt = evtMatch[1].trim();
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(dataMatch[1]); } catch { continue; }

          if (evt === 'progress') {
            setProgress(payload.percent as number);
            setProgressMsg(payload.message as string);
          } else if (evt === 'done') {
            setProgress(100);
            setProgressMsg('分析完成');
            const result = (payload as { data: ClusterInsight }).data;
            setInsightCache((prev) => {
              const existing = prev[key] ?? [];
              const next = { ...prev, [key]: [result, ...existing].slice(0, MAX_HISTORY) };
              persistArchive(next);
              return next;
            });
            setViewingIndex(0);
            setTimeout(() => { setProgress(0); setProgressMsg(''); }, 500);
          } else if (evt === 'error') {
            setProgress(0);
            setProgressMsg('');
            setErrors((prev) => ({ ...prev, [key]: (payload.error as string) || '分析失败' }));
          }
        }
      }
    } catch (err) {
      setProgress(0);
      setProgressMsg('');
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : '网络错误',
      }));
    } finally {
      setAnalyzing((prev) => ({ ...prev, [key]: false }));
    }
  }, [activeScene]);

  const handleUseTemplate = useCallback((template: string, cluster: string) => {
    sessionStorage.setItem(TEMPLATE_KEY, JSON.stringify({
      content: template,
      cluster,
      scene: activeScene,
    }));
    router.push('/');
  }, [activeScene, router]);

  const handleAddToComposer = useCallback((insight: ClusterInsight) => {
    const tmpl = insightToTemplate(insight, activeScene);
    saveComposerTemplate(tmpl);
    router.push(`/composer?templateId=${encodeURIComponent(tmpl.id)}`);
  }, [activeScene, router]);

  const getSupportPrompts = useCallback(
    (cluster: string) =>
      allPrompts
        .filter((p) => p.scene === activeScene && p.goalClusters.includes(cluster))
        .flatMap((p) =>
          p.versions
            .filter((v) => v.effect?.score != null)
            .map((v) => ({
              title: p.title,
              ver: v.ver,
              score: v.effect!.score,
              content: v.content.slice(0, 80),
            })),
        )
        .sort((a, b) => b.score - a.score),
    [allPrompts, activeScene],
  );

  // Panel derived data
  const panelKey = activeCluster ? ck(activeScene, activeCluster) : '';
  const panelHistory = panelKey ? insightCache[panelKey] ?? [] : [];
  const panelLatest = panelHistory[0];
  const panelViewing = panelHistory[viewingIndex] ?? panelLatest;
  const panelAnalyzing = panelKey ? analyzing[panelKey] ?? false : false;
  const panelError = panelKey ? errors[panelKey] : undefined;
  const panelOpen = activeCluster !== null && (panelHistory.length > 0 || panelAnalyzing || !!panelError);
  const isViewingOld = viewingIndex > 0 && panelHistory.length > 1;

  const closePanel = useCallback(() => {
    setActiveCluster(null);
    setShowSupport(false);
    setShowHistory(false);
    setCopied(false);
    setViewingIndex(0);
    setConfirmDeleteIdx(null);
  }, []);

  const openCluster = useCallback((cluster: string) => {
    setActiveCluster(cluster);
    setShowSupport(false);
    setShowHistory(false);
    setCopied(false);
    setViewingIndex(0);
    setConfirmDeleteIdx(null);
  }, []);

  if (storeLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ═══ Main Content ═══ */}
      <div className={`min-w-0 overflow-y-auto transition-[flex] duration-300 ease-out ${panelOpen ? 'flex-[2]' : 'flex-1'}`}>
        <div className={`mx-auto px-6 py-10 transition-[max-width] duration-300 ${panelOpen ? 'max-w-full' : 'max-w-3xl'}`}>
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Insight 规律提炼
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              分析你的高分 Prompt，提炼结构规律，生成最佳模板
            </p>
          </div>

          {/* Scene Tabs */}
          <div className="flex items-center gap-1.5 mb-6">
            {SCENE_TABS.map((s) => {
              const Icon = s.icon;
              const active = activeScene === s.id;
              const count = allPrompts.filter((p) => p.scene === s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => { setActiveScene(s.id); closePanel(); }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                  {s.name}
                  {count > 0 && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full leading-none ${
                      active ? 'bg-white/20' : 'bg-gray-100 text-gray-400'
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* How it works */}
          <div className="bg-gray-50 border border-gray-200/80 rounded-lg px-4 py-3 mb-6 text-xs text-gray-500 leading-relaxed">
            当某目标群积累 ≥{THRESHOLD} 条有评分记录时可触发 AI 分析。新增记录后可重新分析，历次分析自动存档。
            需在<Link href="/settings" className="text-blue-600 hover:text-blue-700 font-medium"> 设置 </Link>中配置 API Key。
          </div>

          {/* Cluster List */}
          <div className="space-y-2">
            {sortedClusters.map((cluster) => {
              const stats = statsByCluster[cluster];
              const key = ck(activeScene, cluster);
              const history = insightCache[key] ?? [];
              const latest = history[0];
              const isReady = stats.withScore >= THRESHOLD;
              const isAnalyzingThis = analyzing[key] ?? false;
              const error = errors[key];
              const isActive = activeCluster === cluster;

              const newRecords = latest ? stats.total - latest.totalCount : 0;
              const newScored = latest
                ? stats.withScore - (latest.highScoreCount + latest.lowScoreCount)
                : 0;
              const hasNewData = newRecords > 0 || newScored > 0;
              const progressDots = Math.min(stats.withScore, THRESHOLD);

              return (
                <div
                  key={cluster}
                  className={`bg-white rounded-xl border px-5 py-4 transition-all ${
                    isActive
                      ? 'border-blue-200 ring-1 ring-blue-100'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        latest ? 'bg-green-500' : isReady ? 'bg-blue-500' : 'bg-gray-300'
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{cluster}</h3>
                          {latest && hasNewData && !isAnalyzingThis && (
                            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full leading-none shrink-0">
                              +{newRecords > 0 ? `${newRecords}条新记录` : `${newScored}条新评分`}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {stats.total}条记录 · {stats.withScore}有评分 · {stats.highScore}高分
                          {history.length > 1 && ` · ${history.length}次分析`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isReady && !latest && (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: THRESHOLD }, (_, i) => (
                              <div key={i} className={`w-4 h-1 rounded-full ${i < progressDots ? 'bg-blue-400' : 'bg-gray-200'}`} />
                            ))}
                          </div>
                          <span className="text-[11px] text-gray-400">{progressDots}/{THRESHOLD}</span>
                        </div>
                      )}

                      {latest && !isAnalyzingThis && (
                        <span className="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          已分析
                        </span>
                      )}

                      {isAnalyzingThis && (
                        <span className="text-xs text-blue-600 font-medium flex items-center gap-1.5">
                          <Loader2 size={12} className="animate-spin" /> 分析中
                        </span>
                      )}

                      {latest && !isAnalyzingThis && isReady && (
                        <button
                          onClick={() => handleAnalyze(cluster)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            hasNewData
                              ? 'bg-gray-900 text-white hover:bg-gray-800'
                              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          重新分析
                        </button>
                      )}

                      {/* First-time analyze */}
                      {isReady && !latest && !isAnalyzingThis && (
                        <button
                          onClick={() => handleAnalyze(cluster)}
                          className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                          开始分析
                        </button>
                      )}

                      {/* View */}
                      {latest && !isAnalyzingThis && (
                        <button
                          onClick={() => isActive ? closePanel() : openCluster(cluster)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-gray-100 text-gray-700'
                              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          {isActive ? '收起' : '查看'}
                        </button>
                      )}
                    </div>
                  </div>

                  {error && !isAnalyzingThis && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <AlertCircle size={12} className="text-red-500 shrink-0" />
                      <span className="text-red-600 flex-1">{error}</span>
                      <button
                        onClick={() => setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; })}
                        className="text-red-400 hover:text-red-600 cursor-pointer"
                      >
                        <XIcon size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* API notice */}
          <div className="mt-8 bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <p className="text-xs text-gray-500 flex-1">
              Insight 分析通过你的 API Key 直接调用 AI 提供商，数据不经过 Promptory 服务器。
            </p>
            <Link
              href="/settings"
              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
            >
              配置 Key <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ Detail Panel ═══ */}
      <div
        className={`overflow-hidden transition-[flex] duration-300 ease-out ${
          panelOpen ? 'flex-[5]' : 'flex-[0]'
        }`}
      >
        <div className="min-w-0 w-full h-full border-l border-gray-200 bg-white flex flex-col">
          {activeCluster && (
            <>
              {/* Panel Header */}
              <div className="px-6 py-5 border-b border-gray-100 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900">「{activeCluster}」结构洞察</h2>
                  <div className="flex items-center gap-1.5">
                    {panelLatest && !panelAnalyzing && (
                      <button
                        onClick={() => handleAnalyze(activeCluster)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                        title="重新分析"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    <button
                      onClick={closePanel}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                </div>
                {/* Version indicator */}
                {panelViewing && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] text-gray-400">
                      {fmtDate(panelViewing.analyzedAt!)} · {panelViewing.totalCount}条 · {panelViewing.highScoreCount}高分
                    </span>
                    {isViewingOld && (
                      <button
                        onClick={() => setViewingIndex(0)}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                      >
                        回到最新
                      </button>
                    )}
                    {panelHistory.length > 1 && (
                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-[11px] text-gray-400 hover:text-gray-600 font-medium cursor-pointer flex items-center gap-0.5 ml-auto"
                      >
                        {panelHistory.length}次分析
                        <ChevronDown size={10} className={`transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                )}
                {/* History dropdown */}
                {showHistory && panelHistory.length > 1 && (
                  <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    {panelHistory.map((entry, i) => (
                      <div
                        key={i}
                        onClick={() => { setViewingIndex(i); setShowHistory(false); setConfirmDeleteIdx(null); }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-3 transition-colors cursor-pointer group ${
                          viewingIndex === i
                            ? 'bg-white font-medium text-gray-900'
                            : 'text-gray-600 hover:bg-white/60'
                        }`}
                      >
                        <span className="flex-1">
                          {fmtDate(entry.analyzedAt!)}
                        </span>
                        <span className="text-gray-400">
                          {entry.totalCount}条 · {entry.highScoreCount}高分 · {entry.lowScoreCount}低分
                        </span>
                        {i === 0 && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">最新</span>
                        )}
                        {confirmDeleteIdx === i ? (
                          <span
                            onClick={(e) => { e.stopPropagation(); handleDeleteEntry(i); }}
                            className="text-[10px] text-red-500 hover:text-red-600 font-medium cursor-pointer px-1.5 py-0.5 bg-red-50 rounded shrink-0"
                          >
                            确认?
                          </span>
                        ) : (
                          <span
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteIdx(i); }}
                            className="text-gray-300 hover:text-red-400 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={11} />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto">
                {/* Analyzing (first time) */}
                {panelAnalyzing && !panelLatest && (
                  <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-full max-w-xs mb-8">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">AI 分析中</span>
                        <span className="text-[11px] text-gray-400 tabular-nums">{progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full transition-[width] duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-3 text-[11px] text-gray-500">
                        {progressMsg || '准备中...'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Re-analyzing banner */}
                {panelAnalyzing && panelLatest && (
                  <div className="mx-6 mt-5">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 flex items-center gap-3">
                      <span className="text-xs text-gray-600 flex-1">正在重新分析，完成后将作为新版本存档...</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{progress}%</span>
                    </div>
                    <div className="w-full h-0.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-gray-400 rounded-full transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {/* Error */}
                {panelError && !panelAnalyzing && (
                  <div className="mx-6 mt-5 bg-red-50 border border-red-100 rounded-lg p-4">
                    <p className="text-sm text-red-700 font-medium mb-1">分析失败</p>
                    <p className="text-xs text-red-600/80">{panelError}</p>
                    <button
                      onClick={() => handleAnalyze(activeCluster)}
                      className="mt-3 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      重试
                    </button>
                  </div>
                )}

                {/* Insight content */}
                {panelViewing && (
                  <div className="px-6 py-5 space-y-6">
                    {/* Old version notice */}
                    {isViewingOld && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 text-xs text-amber-700 flex items-center justify-between">
                        <span>你正在查看历史版本（{fmtDate(panelViewing.analyzedAt!)}），非最新分析结果</span>
                        <button
                          onClick={() => setViewingIndex(0)}
                          className="text-amber-700 font-medium hover:text-amber-800 cursor-pointer underline"
                        >
                          回到最新
                        </button>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3.5 text-center">
                        <span className="text-2xl font-bold text-gray-900">{panelViewing.totalCount}</span>
                        <p className="text-[11px] text-gray-500 mt-1">分析记录数</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3.5 text-center">
                        <span className="text-2xl font-bold text-green-600">{panelViewing.highScoreCount}</span>
                        <p className="text-[11px] text-gray-500 mt-1">高分 ≥4星</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3.5 text-center">
                        <span className="text-2xl font-bold text-red-500">{panelViewing.lowScoreCount}</span>
                        <p className="text-[11px] text-gray-500 mt-1">低分 ≤2星</p>
                      </div>
                    </div>

                    {/* Patterns */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        高分特征
                      </h4>
                      <div className="space-y-2">
                        {panelViewing.patterns.map((pat) => (
                          <div
                            key={pat.name}
                            className={`rounded-lg p-3 border ${
                              pat.found ? 'bg-white border-gray-200' : 'bg-red-50/50 border-red-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                pat.found ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                              }`}>
                                {pat.found ? <Check size={9} strokeWidth={3} /> : <XIcon size={9} strokeWidth={3} />}
                              </div>
                              <span className="text-sm font-medium text-gray-900">{pat.name}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 leading-relaxed ml-6">
                              &ldquo;{pat.example}&rdquo;
                            </p>
                          </div>
                        ))}
                      </div>
                      {panelViewing.missingInLow.length > 0 && (
                        <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 text-xs">
                          <span className="font-medium text-red-700">低分普遍缺失：</span>
                          <span className="text-red-600">{panelViewing.missingInLow.join('、')}</span>
                        </div>
                      )}
                    </div>

                    {/* Template */}
                    {panelViewing.bestTemplate && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">最佳模板</h4>
                          <button
                            onClick={() => handleCopy(panelViewing.bestTemplate)}
                            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                          >
                            {copied ? <><Check size={11} /> 已复制</> : <><Copy size={11} /> 复制</>}
                          </button>
                        </div>
                        <div className="bg-[#1E1E1E] text-gray-300 rounded-lg p-4 text-[13px] font-mono leading-relaxed">
                          <div className="flex gap-1.5 mb-3 border-b border-gray-700/50 pb-2.5">
                            <div className="w-2 h-2 rounded-full bg-[#FF5F56]" />
                            <div className="w-2 h-2 rounded-full bg-[#FFBD2E]" />
                            <div className="w-2 h-2 rounded-full bg-[#27C93F]" />
                          </div>
                          <pre className="whitespace-pre-wrap m-0 font-inherit">{panelViewing.bestTemplate}</pre>
                        </div>
                        <div className="mt-4 space-y-2">
                          <button
                            onClick={() => handleAddToComposer(panelViewing)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
                          >
                            <Wand2 size={14} />
                            加入合成器，开始配置参数
                            <ArrowRight size={14} />
                          </button>
                          <button
                            onClick={() => handleUseTemplate(panelViewing.bestTemplate, activeCluster)}
                            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                          >
                            或直接作为新 Prompt 文本使用
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Support data */}
                    <div className="border-t border-gray-100 pt-4">
                      <button
                        onClick={() => setShowSupport(!showSupport)}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {showSupport ? '收起支撑数据' : '查看支撑数据'}
                        <ChevronRight size={12} className={`transition-transform duration-200 ${showSupport ? 'rotate-90' : ''}`} />
                      </button>
                      {showSupport && (
                        <div className="mt-3 space-y-1.5">
                          {getSupportPrompts(activeCluster).map((item, i) => (
                            <div key={i} className="flex items-center gap-2.5 bg-gray-50 rounded-lg p-2.5">
                              <Stars score={item.score} size={10} />
                              <span className="text-xs font-medium text-gray-700 flex-1 truncate">
                                {item.title} <span className="text-gray-400 font-normal">v{item.ver}</span>
                              </span>
                            </div>
                          ))}
                          {getSupportPrompts(activeCluster).length === 0 && (
                            <p className="text-xs text-gray-400 py-2">暂无有评分的记录</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Delete this analysis */}
                    <div className="border-t border-gray-100 pt-3">
                      {confirmDeleteIdx === viewingIndex ? (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-red-500">确认删除此分析？</span>
                          <button
                            onClick={() => handleDeleteEntry(viewingIndex)}
                            className="text-red-600 font-medium hover:text-red-700 cursor-pointer"
                          >
                            删除
                          </button>
                          <button
                            onClick={() => setConfirmDeleteIdx(null)}
                            className="text-gray-400 hover:text-gray-600 cursor-pointer"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setConfirmDeleteIdx(viewingIndex); setShowHistory(false); }}
                          className="flex items-center gap-1 text-[11px] text-gray-300 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 size={11} />
                          删除此分析
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
