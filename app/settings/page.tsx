'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Eye, EyeOff, Check, Loader2, Download,
  Shield, ChevronRight, AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/client';
import * as db from '@/lib/supabase/database';
import { usePromptStore } from '@/hooks/usePromptStore';
import { SCENE_LABELS } from '@/lib/constants';

const PROVIDERS = [
  {
    id: 'kimi',
    name: 'Kimi',
    vendor: '月之暗面',
    description: '中文 Prompt 分析首选，有免费额度',
    priority: 'recommended',
    color: 'bg-violet-500',
    letter: 'K',
    baseUrl: 'https://api.moonshot.cn/v1',
    testModel: 'moonshot-v1-8k',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    vendor: 'Google',
    description: '免费 tier 较慷慨，通用分析能力强',
    priority: 'p0',
    color: 'bg-sky-500',
    letter: 'G',
    baseUrl: 'https://generativelanguage.googleapis.com',
    testModel: 'gemini-2.0-flash',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: 'DeepSeek',
    description: '价格极低，适合结构分析',
    priority: 'p1',
    color: 'bg-emerald-500',
    letter: 'D',
    baseUrl: 'https://api.deepseek.com/v1',
    testModel: 'deepseek-chat',
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    vendor: 'OpenAI',
    description: '无免费额度，单次分析约 $0.01',
    priority: 'p2',
    color: 'bg-green-600',
    letter: 'O',
    baseUrl: 'https://api.openai.com/v1',
    testModel: 'gpt-4o-mini',
  },
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    description: '无免费额度，高质量分析',
    priority: 'p2',
    color: 'bg-amber-500',
    letter: 'C',
    baseUrl: 'https://api.anthropic.com',
    testModel: 'claude-3-5-haiku-20241022',
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const supabase = isSupabaseConfigured ? createClient() : null;

  const [selectedProvider, setSelectedProvider] = useState('kimi');
  const [savedProvider, setSavedProvider] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const { allPrompts } = usePromptStore();

  useEffect(() => {
    if (!supabase || !user) {
      setLoadingConfig(false);
      return;
    }
    db.getApiConfig(supabase).then((config) => {
      if (config) {
        setSelectedProvider(config.provider);
        setSavedProvider(config.provider);
        setSavedKey(config.api_key);
        setApiKey(config.api_key);
      }
    }).finally(() => setLoadingConfig(false));
  }, [supabase, user]);

  const switchProvider = (id: string) => {
    setSelectedProvider(id);
    setApiKey(id === savedProvider ? savedKey : '');
    setTestStatus('idle');
    setTestError('');
    setShowKey(false);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const res = await fetch('/api/insight/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, apiKey }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(data.error || '连接失败');
      }
    } catch {
      setTestStatus('error');
      setTestError('网络错误');
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      if (supabase && user) {
        await db.saveApiConfig(supabase, user.id, selectedProvider, apiKey);
      }
      setSavedProvider(selectedProvider);
      setSavedKey(apiKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('save config failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = allPrompts.map((p) => ({
      title: p.title,
      goal: p.goal,
      model: p.modelUsed,
      scene: SCENE_LABELS[p.scene] || p.scene,
      goalClusters: p.goalClusters,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      versions: p.versions.map((v) => ({
        ver: v.ver,
        content: v.content,
        changeNote: v.changeNote,
        score: v.effect?.score ?? null,
        outputContent: v.effect?.outputContent || null,
        notes: v.effect?.notes || null,
        isStarred: v.isStarred,
        updatedAt: v.updatedAt,
      })),
    }));
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `promptory-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const handleExportCSV = () => {
    const rows: string[][] = [
      ['标题', '目标', '场景', '目标群', '模型', '版本号', 'Prompt正文', '评分', '效果备注', '创建时间'],
    ];
    for (const p of allPrompts) {
      for (const v of p.versions) {
        rows.push([
          p.title,
          p.goal,
          SCENE_LABELS[p.scene] || p.scene,
          p.goalClusters.join('; '),
          p.modelUsed,
          `v${v.ver}`,
          v.content.replace(/"/g, '""'),
          v.effect?.score?.toString() ?? '',
          (v.effect?.notes ?? '').replace(/"/g, '""'),
          p.createdAt,
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const bom = '\uFEFF';
    downloadFile(bom + csv, `promptory-export-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  };

  const provider = PROVIDERS.find((p) => p.id === selectedProvider)!;

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAFA]">
      <div className="max-w-2xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <Link
            href="/"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">设置</h1>
            <p className="text-sm text-gray-500 mt-0.5">管理 AI 分析配置与数据</p>
          </div>
        </div>

        {/* ── AI Provider ── */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">AI 分析提供商</h2>
            <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              Insight 功能
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            选择用于 Insight 规律提炼的 AI 提供商。Promptory 通过你自己的 API Key
            直接调用分析，数据不经过我们的服务器。
          </p>

          <div className="grid gap-3">
            {PROVIDERS.map((p) => {
              const active = selectedProvider === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => switchProvider(p.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    active
                      ? 'border-blue-500 bg-blue-50/30 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div
                    className={`w-10 h-10 ${p.color} text-white rounded-lg flex items-center justify-center font-bold text-lg shrink-0`}
                  >
                    {p.letter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                      <span className="text-[10px] font-medium text-gray-400">{p.vendor}</span>
                      {p.priority === 'recommended' && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          推荐
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}
                  >
                    {active && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── API Key ── */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-5">
            API Key 配置
          </h2>

          {loadingConfig ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {provider.name} API Key
                  {savedProvider && savedProvider !== selectedProvider && (
                    <span className="ml-2 text-xs font-normal text-amber-600">
                      当前已保存的是 {PROVIDERS.find((p) => p.id === savedProvider)?.name} 的 Key，切换提供商需要填入对应的新 Key
                    </span>
                  )}
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setTestStatus('idle');
                        setTestError('');
                      }}
                      placeholder={`输入你的 ${provider.name} API Key...`}
                      className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-gray-400 hover:border-gray-300 font-mono"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button
                    onClick={handleTest}
                    disabled={!apiKey.trim() || testStatus === 'testing'}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                      !apiKey.trim()
                        ? 'bg-gray-100 text-gray-400 !cursor-not-allowed'
                        : testStatus === 'success'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : testStatus === 'error'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {testStatus === 'testing' && <Loader2 size={14} className="animate-spin" />}
                    {testStatus === 'success' && <Check size={14} />}
                    {testStatus === 'testing'
                      ? '测试中...'
                      : testStatus === 'success'
                        ? '连接成功'
                        : testStatus === 'error'
                          ? '连接失败'
                          : '测试连接'}
                  </button>
                </div>
                {testStatus === 'error' && testError && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                    <AlertCircle size={12} /> {testError}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2.5 bg-gray-50 rounded-lg p-3.5">
                <Shield size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  API Key 加密存储在你的 Supabase 数据库中。Insight 分析时，仅将 Prompt 正文与评分发送给 AI
                  API，不发送个人信息。每次分析预计消耗约 2000 – 4000 tokens。
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={!apiKey.trim() || saving}
                  className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 cursor-pointer ${
                    saved
                      ? 'bg-green-600 text-white'
                      : apiKey.trim() && !saving
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20'
                        : 'bg-gray-200 text-gray-400 !cursor-not-allowed'
                  }`}
                >
                  {saving ? (
                    <><Loader2 size={16} className="animate-spin" /> 保存中...</>
                  ) : saved ? (
                    <><Check size={16} /> 已保存</>
                  ) : (
                    '保存配置'
                  )}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Data Management ── */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-5">
            数据管理
          </h2>

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <div className="p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">导出全部数据</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  导出所有 Prompt 记录为 JSON 或 CSV 格式
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExportJSON} disabled={allPrompts.length === 0} className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download size={14} /> JSON
                </button>
                <button onClick={handleExportCSV} disabled={allPrompts.length === 0} className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>
            <div className="p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-red-600">清除所有数据</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  此操作不可撤销，建议先导出备份
                </p>
              </div>
              <button className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-all cursor-pointer">
                清除数据
              </button>
            </div>
          </div>
        </section>

        {/* ── Insight Quick Link ── */}
        <section className="mb-10">
          <Link
            href="/insight"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50/20 transition-all group"
          >
            <div>
              <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                Insight 规律提炼
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                查看已积累的 Prompt 结构分析报告
              </p>
            </div>
            <ChevronRight
              size={18}
              className="text-gray-400 group-hover:text-blue-600 transition-colors"
            />
          </Link>
        </section>

        {/* ── Footer ── */}
        <section className="text-center text-xs text-gray-400 pb-10">
          <p>Promptory v0.5.0 · Your personal prompt muscle</p>
          <p className="mt-1">数据安全：全程 HTTPS · 行级隔离 · 数据不对外可见</p>
        </section>
      </div>
    </div>
  );
}
