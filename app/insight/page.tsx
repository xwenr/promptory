'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Sparkles, Check, X as XIcon, Copy,
  Star, ChevronRight, AlertCircle, Lock, Loader2,
  Code2, GraduationCap, Briefcase, MoreHorizontal,
  Zap, RefreshCw, ChevronDown, Info,
} from 'lucide-react';
import Link from 'next/link';
import Stars from '@/components/Stars';
import { usePromptStore } from '@/hooks/usePromptStore';
import { CLUSTERS_BY_SCENE, SCENE_LABELS } from '@/lib/constants';
import type { ClusterInsight, PromptRecord } from '@/lib/types';

const SCENE_TABS = [
  { id: 'coding', name: 'Vibe Coding', icon: Code2 },
  { id: 'academic', name: '学术写作', icon: GraduationCap },
  { id: 'pm', name: '产品经理', icon: Briefcase },
  { id: 'other', name: '其他', icon: MoreHorizontal },
];

const THRESHOLD = 3;

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

  let withScore = 0;
  let highScore = 0;
  let lowScore = 0;

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

export default function InsightPage() {
  const { allPrompts, loading: storeLoading } = usePromptStore();
  const [activeScene, setActiveScene] = useState('coding');
  const [copied, setCopied] = useState('');
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [showSupportData, setShowSupportData] = useState<string | null>(null);

  const [insightCache, setInsightCache] = useState<Record<string, ClusterInsight>>({});
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clusters = CLUSTERS_BY_SCENE[activeScene] ?? [];

  const statsByCluster = useMemo(() => {
    const map: Record<string, ClusterStats> = {};
    for (const cluster of clusters) {
      map[cluster] = computeClusterStats(allPrompts, activeScene, cluster);
    }
    return map;
  }, [allPrompts, activeScene, clusters]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleAnalyze = useCallback(async (cluster: string) => {
    setAnalyzing((prev) => ({ ...prev, [cluster]: true }));
    setErrors((prev) => { const n = { ...prev }; delete n[cluster]; return n; });

    try {
      const res = await fetch('/api/insight/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, scene: activeScene }),
      });
      const data = await res.json();

      if (data.success && data.data) {
        setInsightCache((prev) => ({ ...prev, [cluster]: data.data }));
        setExpandedCluster(cluster);
      } else {
        setErrors((prev) => ({ ...prev, [cluster]: data.error || '分析失败' }));
      }
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [cluster]: err instanceof Error ? err.message : '网络错误',
      }));
    } finally {
      setAnalyzing((prev) => ({ ...prev, [cluster]: false }));
    }
  }, [activeScene]);

  const getSupportPrompts = useCallback(
    (cluster: string) => {
      return allPrompts
        .filter((p) => p.scene === activeScene && p.goalClusters.includes(cluster))
        .flatMap((p) =>
          p.versions
            .filter((v) => v.effect?.score != null)
            .map((v) => ({
              title: p.title,
              ver: v.ver,
              score: v.effect!.score,
              content: v.content.slice(0, 100),
            })),
        )
        .sort((a, b) => b.score - a.score);
    },
    [allPrompts, activeScene],
  );

  const sortedClusters = useMemo(() => {
    return [...clusters].sort((a, b) => {
      const sa = statsByCluster[a] ?? { total: 0, highScore: 0 };
      const sb = statsByCluster[b] ?? { total: 0, highScore: 0 };
      if (sa.highScore >= 1 && sb.highScore === 0) return -1;
      if (sb.highScore >= 1 && sa.highScore === 0) return 1;
      return sb.total - sa.total;
    });
  }, [clusters, statsByCluster]);

  if (storeLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <Loader2 size={24} className="animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="max-w-4xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="p-2 text-ink-muted hover:text-ink-secondary hover:bg-surface-raised rounded-lg border border-transparent hover:border-edge transition-all"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-ink tracking-tight">
                Insight 规律提炼
              </h1>
              <Sparkles size={20} className="text-blue-500" />
            </div>
            <p className="text-sm text-ink-secondary mt-0.5">
              分析你的高分 Prompt，提炼结构规律，生成最佳模板
            </p>
          </div>
        </div>

        {/* Scene Tabs */}
        <div className="flex items-center gap-2 mb-8">
          {SCENE_TABS.map((s) => {
            const Icon = s.icon;
            const active = activeScene === s.id;
            const sceneCount = allPrompts.filter((p) => p.scene === s.id).length;
            return (
              <button
                key={s.id}
                onClick={() => { setActiveScene(s.id); setExpandedCluster(null); setShowSupportData(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                    : 'bg-surface-raised text-ink-secondary border border-edge hover:bg-surface-inset hover:border-edge'
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                {s.name}
                {sceneCount > 0 && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-surface-inset text-ink-muted'}`}>
                    {sceneCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* How it works */}
        <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100/80 dark:border-blue-900/40 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
            <span className="font-medium">工作原理：</span> 当某目标群积累了 ≥{THRESHOLD} 条有评分记录且有高分（≥4星）时，
            可触发 AI 分析。分析将对比高低分 Prompt 结构差异，提炼共同要素并生成最佳模板。
            需在<Link href="/settings" className="underline font-medium hover:text-blue-900 dark:hover:text-blue-200"> 设置 </Link>中配置 API Key。
          </div>
        </div>

        {/* Cluster Cards */}
        <div className="space-y-4">
          {sortedClusters.map((cluster) => {
            const stats = statsByCluster[cluster] ?? { total: 0, withScore: 0, highScore: 0, lowScore: 0 };
            const isReady = stats.withScore >= THRESHOLD && stats.highScore >= 1;
            const isAnalyzing = analyzing[cluster] ?? false;
            const insight = insightCache[cluster];
            const error = errors[cluster];
            const isExpanded = expandedCluster === cluster;
            const progress = Math.min(stats.withScore, THRESHOLD);

            return (
              <div
                key={cluster}
                className="bg-surface-raised rounded-xl border border-edge overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Cluster Header */}
                <div
                  onClick={() => {
                    if (insight || isReady) setExpandedCluster(isExpanded ? null : cluster);
                  }}
                  className={`px-6 py-4 flex items-center justify-between ${insight || isReady ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      insight ? 'bg-green-500' : isReady ? 'bg-blue-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'
                    }`} />
                    <h3 className="font-semibold text-ink">{cluster}</h3>
                    <span className="text-xs text-ink-muted">
                      {stats.total} 条记录 · {stats.withScore} 条有评分 · {stats.highScore} 条高分
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {!isReady && !insight && (
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <div className="flex gap-0.5">
                          {Array.from({ length: THRESHOLD }, (_, i) => (
                            <div
                              key={i}
                              className={`w-5 h-1.5 rounded-full ${
                                i < progress ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span>
                          {stats.withScore >= THRESHOLD
                            ? '需要高分（≥4星）记录'
                            : `还需 ${THRESHOLD - stats.withScore} 条有评分记录`}
                        </span>
                      </div>
                    )}

                    {isReady && !insight && !isAnalyzing && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAnalyze(cluster); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                      >
                        <Zap size={12} /> 开始分析
                      </button>
                    )}

                    {isAnalyzing && (
                      <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
                        <Loader2 size={14} className="animate-spin" /> AI 分析中...
                      </span>
                    )}

                    {insight && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check size={10} /> 已分析
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAnalyze(cluster); }}
                          className="p-1 text-ink-muted hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          title="重新分析"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <ChevronDown size={14} className={`text-ink-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="border-t border-edge-light px-6 py-3 bg-red-50/50 dark:bg-red-950/30 flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-500 shrink-0" />
                    <span className="text-xs text-red-700 dark:text-red-300">{error}</span>
                    <button
                      onClick={() => setErrors((prev) => { const n = { ...prev }; delete n[cluster]; return n; })}
                      className="ml-auto text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                    >
                      关闭
                    </button>
                  </div>
                )}

                {/* Insight Content */}
                {insight && isExpanded && (
                  <div className="border-t border-edge-light">
                    {/* Stats Banner */}
                    <div className="px-6 py-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-secondary">已积累</span>
                        <span className="font-bold text-ink">{insight.totalCount}</span>
                        <span className="text-ink-secondary">条</span>
                      </div>
                      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
                      <div className="flex items-center gap-2">
                        <span className="text-ink-secondary">高分（≥4星）</span>
                        <span className="font-bold text-green-700 dark:text-green-400">{insight.highScoreCount}</span>
                        <span className="text-ink-secondary">条</span>
                      </div>
                      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
                      <div className="flex items-center gap-2">
                        <span className="text-ink-secondary">低分（≤2星）</span>
                        <span className="font-bold text-red-600 dark:text-red-400">{insight.lowScoreCount}</span>
                        <span className="text-ink-secondary">条</span>
                      </div>
                      {insight.analyzedAt && (
                        <>
                          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
                          <span className="text-xs text-ink-muted">
                            分析于 {new Date(insight.analyzedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Patterns */}
                    <div className="px-6 py-5">
                      <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider mb-4">
                        高分 Prompt 共同结构要素
                      </h4>
                      <div className="space-y-3">
                        {insight.patterns.map((pat) => (
                          <div key={pat.name} className="flex items-start gap-3">
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                pat.found
                                  ? 'bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400'
                                  : 'bg-red-100 dark:bg-red-950/30 text-red-500 dark:text-red-400'
                              }`}
                            >
                              {pat.found ? (
                                <Check size={12} strokeWidth={3} />
                              ) : (
                                <XIcon size={12} strokeWidth={3} />
                              )}
                            </div>
                            <div>
                              <span className="text-sm font-medium text-ink">{pat.name}</span>
                              <p className="text-xs text-ink-secondary mt-0.5">&ldquo;{pat.example}&rdquo;</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {insight.missingInLow.length > 0 && (
                        <div className="mt-5 bg-red-50/60 dark:bg-red-950/30 rounded-lg p-4 flex items-start gap-3">
                          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm text-red-800 dark:text-red-300 font-medium">低分 Prompt 普遍缺失</p>
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                              {insight.missingInLow.join(' + ')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Best Template */}
                    {insight.bestTemplate && (
                      <div className="px-6 py-5 border-t border-edge-light">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider flex items-center gap-1.5">
                            <Star size={14} className="text-amber-400" fill="currentColor" />
                            你的最佳模板
                          </h4>
                          <button
                            onClick={() => handleCopy(insight.bestTemplate, cluster)}
                            className="flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            {copied === cluster ? (
                              <><Check size={12} /> 已复制</>
                            ) : (
                              <><Copy size={12} /> 复制</>
                            )}
                          </button>
                        </div>

                        <div className="bg-code-surface text-gray-300 rounded-xl p-5 text-sm font-mono leading-relaxed shadow-sm">
                          <div className="flex gap-1.5 mb-3 border-b border-gray-700/50 pb-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                            <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                          </div>
                          <pre className="whitespace-pre-wrap m-0 font-inherit">{insight.bestTemplate}</pre>
                        </div>

                        <div className="flex items-center gap-3 mt-4">
                          <Link
                            href="/"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5"
                          >
                            用此模板创建新 Prompt <ChevronRight size={14} />
                          </Link>
                          <button
                            onClick={() => setShowSupportData(showSupportData === cluster ? null : cluster)}
                            className="px-4 py-2 bg-surface-raised border border-edge text-ink-secondary rounded-lg text-sm font-medium hover:bg-surface-inset transition-colors cursor-pointer"
                          >
                            {showSupportData === cluster ? '收起支撑数据' : '查看支撑数据'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Support Data */}
                    {showSupportData === cluster && (
                      <div className="px-6 py-5 border-t border-edge-light bg-surface-inset">
                        <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider mb-3">
                          参与分析的 Prompt 记录
                        </h4>
                        <div className="space-y-2">
                          {getSupportPrompts(cluster).map((item, i) => (
                            <div key={i} className="flex items-center gap-3 bg-surface-raised rounded-lg p-3 border border-edge-light">
                              <Stars score={item.score} size={11} />
                              <span className="text-sm font-medium text-ink flex-1 truncate">
                                {item.title} <span className="text-ink-muted font-normal">v{item.ver}</span>
                              </span>
                              <span className="text-xs text-ink-muted truncate max-w-[200px]">{item.content}...</span>
                            </div>
                          ))}
                          {getSupportPrompts(cluster).length === 0 && (
                            <p className="text-xs text-ink-muted py-2">暂无有评分的记录</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Locked state */}
                {!isReady && !insight && stats.total === 0 && (
                  <div className="border-t border-edge-light px-6 py-8 text-center">
                    <Lock size={20} className="text-ink-muted mx-auto mb-2" />
                    <p className="text-sm text-ink-muted">开始积累此目标群的 Prompt 记录</p>
                    <p className="text-xs text-ink-muted mt-1">
                      需要至少 {THRESHOLD} 条有评分的记录且含高分（≥4星）才能触发分析
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* API Key Notice */}
        <div className="mt-8 bg-surface-raised rounded-xl border border-edge p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/30 rounded-lg flex items-center justify-center shrink-0">
            <AlertCircle size={20} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-ink">AI 分析由你的 API Key 驱动</h4>
            <p className="text-xs text-ink-secondary mt-0.5">
              Insight 分析通过你自己的 API Key 直接调用 AI 提供商，数据不经过 Promptory 服务器。
              单次分析约 2000–4000 tokens，Kimi/DeepSeek 成本 &lt; ¥0.01。
            </p>
          </div>
          <Link
            href="/settings"
            className="px-4 py-2 bg-surface-raised border border-edge text-ink-secondary rounded-lg text-sm font-medium hover:bg-surface-inset hover:border-edge transition-all flex items-center gap-1.5 shrink-0"
          >
            配置 Key <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
