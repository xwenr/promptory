'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SCENE_LABELS } from '@/lib/constants';
import {
  loadComposerTemplates,
  saveComposerTemplate,
  deleteComposerTemplate,
  renderPrompt,
  createBlankTemplate,
  createFieldFromPlaceholder,
  parsePlaceholders,
  groupFieldsBySection,
  parseMultiValue,
  joinMultiValue,
  expandMultiOptions,
  getSectionBrief,
  type FieldSection,
} from '@/lib/composer';
import type { ComposerTemplate, ComposerField, SectionBriefId } from '@/lib/types';

const COMPOSER_OUTPUT_KEY = 'promptory-composer-output';
const SCENE_IDS = ['pm', 'coding', 'academic', 'other'];

/* ── Page body ── */
function ComposerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTemplateId = searchParams.get('templateId');

  const [templates, setTemplates] = useState<ComposerTemplate[]>([]);
  const [activeScene, setActiveScene] = useState<string>('coding');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});
  const [suggestError, setSuggestError] = useState<Record<string, string>>({});
  const [autofilling, setAutofilling] = useState<Record<string, boolean>>({});
  const [autofillError, setAutofillError] = useState<Record<string, string>>({});
  const [batchFilling, setBatchFilling] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchNotice, setBatchNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* ── Load + URL resolve ── */
  useEffect(() => {
    const all = loadComposerTemplates();
    setTemplates(all);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (urlTemplateId) {
      const t = templates.find((x) => x.id === urlTemplateId);
      if (t) {
        setActiveScene(t.scene);
        setActiveId(t.id);
        return;
      }
    }

    if (activeId && templates.some((x) => x.id === activeId)) return;

    const inScene = templates.filter((t) => t.scene === activeScene);
    if (inScene.length > 0) {
      setActiveId(inScene[0].id);
    } else if (templates.length > 0) {
      setActiveScene(templates[0].scene);
      setActiveId(templates[0].id);
    } else {
      setActiveId(null);
    }
  }, [hydrated, urlTemplateId, templates, activeScene, activeId]);

  useEffect(() => {
    setValues({});
    setEditingName(false);
  }, [activeId]);

  /* ── Escape closes drawer ── */
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeId) ?? null,
    [templates, activeId],
  );

  const templatesInScene = useMemo(
    () => templates.filter((t) => t.scene === activeScene),
    [templates, activeScene],
  );

  /* ── Template mutations ── */
  const patchTemplate = useCallback((id: string, updater: (t: ComposerTemplate) => ComposerTemplate) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = updater(prev[idx]);
      const withTime = { ...next, updatedAt: new Date().toISOString() };
      const list = [...prev];
      list[idx] = withTime;
      saveComposerTemplate(withTime);
      return list;
    });
  }, []);

  /* ── Field handlers ── */
  const updateValue = useCallback((fieldId: string, v: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
  }, []);

  const toggleQuick = useCallback((fieldId: string, v: string) => {
    setValues((prev) => ({
      ...prev,
      [fieldId]: prev[fieldId] === v ? '' : v,
    }));
  }, []);

  const removeQuickOption = useCallback((fieldId: string, optValue: string) => {
    if (!activeTemplate) return;
    patchTemplate(activeTemplate.id, (t) => ({
      ...t,
      fields: t.fields.map((f) =>
        f.id === fieldId
          ? { ...f, quickOptions: f.quickOptions.filter((o) => o.value !== optValue) }
          : f,
      ),
    }));
  }, [activeTemplate, patchTemplate]);

  const addQuickOptionManual = useCallback((fieldId: string, raw: string) => {
    if (!activeTemplate) return;
    const val = raw.trim();
    if (!val) return;
    patchTemplate(activeTemplate.id, (t) => ({
      ...t,
      fields: t.fields.map((f) => {
        if (f.id !== fieldId) return f;
        if (f.quickOptions.some((o) => o.value === val)) return f;
        return {
          ...f,
          quickOptions: [
            ...f.quickOptions,
            { label: val.length > 14 ? val.slice(0, 14) + '…' : val, value: val },
          ],
        };
      }),
    }));
  }, [activeTemplate, patchTemplate]);

  const handleAISuggest = useCallback(async (field: ComposerField) => {
    if (!activeTemplate) return;
    const sKey = field.id;
    setSuggesting((prev) => ({ ...prev, [sKey]: true }));
    setSuggestError((prev) => {
      const n = { ...prev };
      delete n[sKey];
      return n;
    });

    try {
      const res = await fetch('/api/composer/suggest-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldLabel: field.label,
          fieldPlaceholder: field.placeholder,
          fieldDescription: field.description,
          scene: activeTemplate.scene,
          cluster: activeTemplate.cluster,
          existingOptions: field.quickOptions.map((o) => o.value),
          templateBody: activeTemplate.body,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '请求失败');

      const rawNew = (data.options as string[]).map((v) => ({
        label: v.length > 14 ? v.slice(0, 14) + '…' : v,
        value: v,
      }));
      const newOptions = field.multi ? expandMultiOptions(rawNew) : rawNew;

      patchTemplate(activeTemplate.id, (t) => ({
        ...t,
        fields: t.fields.map((f) => {
          if (f.id !== field.id) return f;
          const existing = new Set(f.quickOptions.map((o) => o.value));
          const merged = [...f.quickOptions];
          for (const o of newOptions) {
            if (!existing.has(o.value)) merged.push(o);
          }
          return { ...f, quickOptions: merged };
        }),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '请求失败';
      setSuggestError((prev) => ({ ...prev, [sKey]: msg }));
    } finally {
      setSuggesting((prev) => {
        const n = { ...prev };
        delete n[sKey];
        return n;
      });
    }
  }, [activeTemplate, patchTemplate]);

  const handleBatchFillTags = useCallback(async () => {
    if (!activeTemplate) return;
    const targets = activeTemplate.fields.filter(
      (f) => f.multi === true && f.quickOptions.length === 0,
    );
    if (targets.length === 0) return;

    setBatchFilling(true);
    setBatchNotice(null);
    setBatchProgress({ done: 0, total: targets.length });

    let doneCount = 0;
    let successCount = 0;
    let failCount = 0;
    let firstError: string | null = null;

    // Serial to stay under provider rate limits and give users a visible
    // "3/7 补全中…" progress indicator.
    for (const field of targets) {
      try {
        const res = await fetch('/api/composer/suggest-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fieldLabel: field.label,
            fieldPlaceholder: field.placeholder,
            fieldDescription: field.description,
            scene: activeTemplate.scene,
            cluster: activeTemplate.cluster,
            existingOptions: [],
            templateBody: activeTemplate.body,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '请求失败');
        const rawNew = (data.options as string[]).map((v) => ({
          label: v.length > 14 ? v.slice(0, 14) + '…' : v,
          value: v,
        }));
        const newOptions = expandMultiOptions(rawNew);

        patchTemplate(activeTemplate.id, (t) => ({
          ...t,
          fields: t.fields.map((f) => {
            if (f.id !== field.id) return f;
            const existing = new Set(f.quickOptions.map((o) => o.value));
            const merged = [...f.quickOptions];
            for (const o of newOptions) {
              if (!existing.has(o.value)) merged.push(o);
            }
            return { ...f, quickOptions: merged };
          }),
        }));
        if (newOptions.length > 0) successCount += 1;
      } catch (err) {
        failCount += 1;
        if (!firstError) firstError = err instanceof Error ? err.message : '请求失败';
      } finally {
        doneCount += 1;
        setBatchProgress({ done: doneCount, total: targets.length });
      }
    }

    setBatchFilling(false);
    setBatchProgress(null);
    if (failCount === 0) {
      setBatchNotice({ tone: 'success', text: `已补全 ${successCount} 个字段` });
    } else if (successCount === 0) {
      setBatchNotice({ tone: 'error', text: firstError || '全部补全失败' });
    } else {
      setBatchNotice({
        tone: 'error',
        text: `补全 ${successCount} 个、失败 ${failCount} 个（${firstError ?? '部分字段失败'}）`,
      });
    }
  }, [activeTemplate, patchTemplate]);

  const handleSectionAutofill = useCallback(
    async (
      sectionId: SectionBriefId,
      sectionTitle: string,
      sectionDimensions: string[],
      userDescription: string,
      fieldsInSection: ComposerField[],
    ) => {
      if (!activeTemplate) return;
      const key = sectionId;
      setAutofilling((prev) => ({ ...prev, [key]: true }));
      setAutofillError((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });

      try {
        const res = await fetch('/api/composer/autofill-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene: activeTemplate.scene,
            cluster: activeTemplate.cluster,
            templateBody: activeTemplate.body,
            sectionId,
            sectionTitle,
            sectionDimensions,
            userDescription,
            fields: fieldsInSection.map((f) => ({
              id: f.id,
              label: f.label,
              friendlyLabel: f.friendlyLabel,
              placeholder: f.placeholder,
              description: f.description,
              friendlyHint: f.friendlyHint,
              type: f.type,
              multi: f.multi === true,
              existingOptions: f.quickOptions.map((o) => o.value),
            })),
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '请求失败');

        const returned = (data.fields ?? []) as Array<{
          id: string;
          value: string;
          tags?: string[];
        }>;

        const tagsByFieldId = new Map<string, string[]>();
        const valueUpdates: Record<string, string> = {};
        for (const r of returned) {
          if (!r.id) continue;
          if (Array.isArray(r.tags) && r.tags.length > 0) {
            tagsByFieldId.set(r.id, r.tags);
          }
          if (typeof r.value === 'string' && r.value.trim().length > 0) {
            valueUpdates[r.id] = r.value.trim();
          }
        }

        if (tagsByFieldId.size > 0) {
          patchTemplate(activeTemplate.id, (t) => ({
            ...t,
            fields: t.fields.map((f) => {
              const tags = tagsByFieldId.get(f.id);
              if (!tags || tags.length === 0) return f;
              const existing = new Set(f.quickOptions.map((o) => o.value));
              const merged = [...f.quickOptions];
              for (const tag of tags) {
                if (!existing.has(tag)) {
                  merged.push({
                    label: tag.length > 14 ? tag.slice(0, 14) + '…' : tag,
                    value: tag,
                  });
                  existing.add(tag);
                }
              }
              return { ...f, quickOptions: merged };
            }),
          }));
        }

        if (Object.keys(valueUpdates).length > 0) {
          setValues((prev) => ({ ...prev, ...valueUpdates }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '请求失败';
        setAutofillError((prev) => ({ ...prev, [key]: msg }));
      } finally {
        setAutofilling((prev) => {
          const n = { ...prev };
          delete n[key];
          return n;
        });
      }
    },
    [activeTemplate, patchTemplate],
  );

  /* ── Template-level operations ── */
  const handleRename = useCallback((name: string) => {
    if (!activeTemplate) return;
    patchTemplate(activeTemplate.id, (t) => ({ ...t, name: name.trim() || t.name }));
  }, [activeTemplate, patchTemplate]);

  const handleCreateBlank = useCallback(() => {
    const tmpl = createBlankTemplate(activeScene);
    saveComposerTemplate(tmpl);
    setTemplates((prev) => [tmpl, ...prev]);
    setActiveId(tmpl.id);
    setDrawerOpen(false);
  }, [activeScene]);

  const handleDelete = useCallback((id: string) => {
    deleteComposerTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
    setConfirmDeleteId(null);
  }, [activeId]);

  const handleSelectTemplate = useCallback((id: string) => {
    setActiveId(id);
    setDrawerOpen(false);
  }, []);

  const handleAddField = useCallback((name: string, type: 'input' | 'textarea') => {
    if (!activeTemplate) return;
    const clean = name.trim();
    if (!clean) return;
    if (activeTemplate.fields.some((f) => f.placeholder === clean)) return;
    patchTemplate(activeTemplate.id, (t) => {
      const newField = createFieldFromPlaceholder(clean, type);
      const joiner = t.body.length === 0 ? '' : t.body.endsWith('\n') ? '' : '\n';
      const newBody = t.body + joiner + `[${clean}]`;
      return { ...t, body: newBody, fields: [...t.fields, newField] };
    });
  }, [activeTemplate, patchTemplate]);

  const handleBodyChange = useCallback((newBody: string) => {
    if (!activeTemplate) return;
    const newPhs = parsePlaceholders(newBody);
    patchTemplate(activeTemplate.id, (t) => {
      const existing = new Map(t.fields.map((f) => [f.placeholder, f]));
      const fields: ComposerField[] = newPhs.map((ph) => {
        const prev = existing.get(ph);
        if (prev) return prev;
        return {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          label: ph,
          placeholder: ph,
          type: 'input',
          quickOptions: [],
          color: '#3B82F6',
        };
      });
      return { ...t, body: newBody, fields };
    });
  }, [activeTemplate, patchTemplate]);

  const finalPrompt = useMemo(() => {
    if (!activeTemplate) return '';
    return renderPrompt(activeTemplate, values);
  }, [activeTemplate, values]);

  const handleCopy = useCallback(() => {
    if (!finalPrompt) return;
    navigator.clipboard.writeText(finalPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [finalPrompt]);

  const handlePushToRepo = useCallback(() => {
    if (!activeTemplate || !finalPrompt) return;
    sessionStorage.setItem(COMPOSER_OUTPUT_KEY, JSON.stringify({
      content: finalPrompt,
      scene: activeTemplate.scene,
      cluster: activeTemplate.cluster,
      templateName: activeTemplate.name,
    }));
    setPushed(true);
    setTimeout(() => router.push('/'), 260);
  }, [activeTemplate, finalPrompt, router]);

  const filledCount = useMemo(() => {
    if (!activeTemplate) return 0;
    return activeTemplate.fields.filter((f) => (values[f.id] ?? '').trim().length > 0).length;
  }, [activeTemplate, values]);

  const emptyMultiFieldCount = useMemo(() => {
    if (!activeTemplate) return 0;
    return activeTemplate.fields.filter(
      (f) => f.multi === true && f.quickOptions.length === 0,
    ).length;
  }, [activeTemplate]);

  useEffect(() => {
    if (!batchNotice) return;
    const t = setTimeout(() => setBatchNotice(null), 4000);
    return () => clearTimeout(t);
  }, [batchNotice]);

  /* ────────────────────── Render ────────────────────── */

  if (!hydrated) {
    return (
      <div className="h-full flex items-center justify-center bg-[#FAFAFA]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#FAFAFA]">
      {/* ═══════════════ Header ═══════════════ */}
      <header className="shrink-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 z-10">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/"
            className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors duration-200 cursor-pointer shrink-0 tracking-wide"
          >
            ‹ 返回
          </Link>
          <div className="h-4 w-px bg-gray-200 shrink-0" />
          <h1 className="text-[13px] font-semibold text-gray-900 tracking-wide shrink-0">
            Prompt 合成器
          </h1>
          {activeTemplate && (
            <>
              <span className="text-gray-300 shrink-0">/</span>
              <span className="text-[13px] text-gray-500 truncate">
                {activeTemplate.name}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {activeTemplate && (
            <>
              <span className="text-[11px] text-gray-400 tabular-nums mr-3 tracking-wide">
                {filledCount} / {activeTemplate.fields.length}
              </span>
              {(emptyMultiFieldCount > 0 || batchFilling) && (
                <HeaderBtn
                  onClick={handleBatchFillTags}
                  disabled={batchFilling || emptyMultiFieldCount === 0}
                  title={
                    batchFilling
                      ? '正在逐个字段调用 AI 生成候选…'
                      : `为 ${emptyMultiFieldCount} 个没有候选 tag 的多选字段批量生成候选`
                  }
                >
                  {batchFilling && batchProgress
                    ? `补全中 ${batchProgress.done}/${batchProgress.total}`
                    : `✦ 一键补全 ${emptyMultiFieldCount} 个空 tag`}
                </HeaderBtn>
              )}
              <HeaderBtn onClick={() => setValues({})}>清空</HeaderBtn>
              <HeaderBtn onClick={handlePushToRepo} tone={pushed ? 'success' : 'default'}>
                {pushed ? '已发送' : '新建到仓库'}
              </HeaderBtn>
              <HeaderBtn onClick={handleCopy} tone="primary">
                {copied ? '已复制' : '复制去生成'}
              </HeaderBtn>
            </>
          )}
        </div>
      </header>

      {batchNotice && (
        <div
          className={`shrink-0 px-5 py-1.5 text-[12px] tracking-wide border-b ${
            batchNotice.tone === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}
        >
          {batchNotice.text}
        </div>
      )}

      {/* ═══════════════ Body ═══════════════ */}
      <div className="flex flex-1 min-h-0 relative">
        {/* ── Rail (collapsed state) ── */}
        <div
          onClick={() => setDrawerOpen(true)}
          className="relative w-10 shrink-0 bg-white border-r border-gray-200 flex flex-col items-center justify-center cursor-pointer group hover:bg-gray-50 transition-colors duration-200"
          title="打开模板库"
        >
          <div
            className="text-[11px] text-gray-400 group-hover:text-gray-700 tracking-[0.3em] transition-colors duration-200 select-none flex items-center gap-2"
            style={{ writingMode: 'vertical-rl' }}
          >
            <span>模板库</span>
            {templates.length > 0 && (
              <span className="text-gray-300 group-hover:text-gray-500 tabular-nums">
                {templates.length}
              </span>
            )}
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gray-300 group-hover:text-gray-500 text-[13px] transition-colors duration-200">
            ›
          </div>
        </div>

        {/* ── Main Split ── */}
        <main className="flex flex-1 min-w-0">
          {/* Form Panel */}
          <section className="w-[46%] min-w-[440px] max-w-[620px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            {!activeTemplate ? (
              <EmptyState onCreate={handleCreateBlank} onOpenDrawer={() => setDrawerOpen(true)} />
            ) : (
              <div className="px-8 pt-7 pb-24">
                {/* Name + Cluster + Progress */}
                <div className="mb-7 pb-5 border-b border-gray-100">
                  {editingName ? (
                    <input
                      autoFocus
                      defaultValue={activeTemplate.name}
                      onBlur={(e) => { handleRename(e.target.value); setEditingName(false); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { handleRename((e.target as HTMLInputElement).value); setEditingName(false); }
                        if (e.key === 'Escape') setEditingName(false);
                      }}
                      className="w-full text-[17px] font-semibold text-gray-900 border-0 border-b border-blue-400 bg-transparent outline-none py-0.5 tracking-tight"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingName(true)}
                      className="text-[17px] font-semibold text-gray-900 hover:text-blue-600 transition-colors duration-200 cursor-text text-left tracking-tight"
                    >
                      {activeTemplate.name}
                    </button>
                  )}
                  <div className="flex items-center gap-2.5 mt-2">
                    <p className="text-[11px] text-gray-400 tracking-wide">
                      {activeTemplate.cluster ? `来自 Insight · ${activeTemplate.cluster}` : '自定义模板'}
                      <span className="mx-1.5 text-gray-300">·</span>
                      {activeTemplate.fields.length} 个参数
                    </p>
                    <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full transition-all duration-300"
                        style={{
                          width: `${
                            activeTemplate.fields.length === 0
                              ? 0
                              : (filledCount / activeTemplate.fields.length) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-gray-500 tabular-nums tracking-wide">
                      {filledCount}/{activeTemplate.fields.length}
                    </span>
                  </div>
                </div>

                {activeTemplate.fields.length === 0 ? (
                  <FieldsEmptyState onAdd={handleAddField} />
                ) : (
                  <SectionedFields
                    template={activeTemplate}
                    fields={activeTemplate.fields}
                    values={values}
                    suggesting={suggesting}
                    suggestError={suggestError}
                    autofilling={autofilling}
                    autofillError={autofillError}
                    onUpdate={updateValue}
                    onToggleQuick={toggleQuick}
                    onRemoveOption={removeQuickOption}
                    onAddOption={addQuickOptionManual}
                    onAISuggest={handleAISuggest}
                    onAutofillSection={handleSectionAutofill}
                    onDismissError={(fieldId) =>
                      setSuggestError((prev) => {
                        const n = { ...prev };
                        delete n[fieldId];
                        return n;
                      })
                    }
                    onDismissAutofillError={(sectionId) =>
                      setAutofillError((prev) => {
                        const n = { ...prev };
                        delete n[sectionId];
                        return n;
                      })
                    }
                  />
                )}

                {activeTemplate.fields.length > 0 && (
                  <div className="mt-8 pt-5 border-t border-dashed border-gray-200">
                    <p className="text-[11px] font-medium text-gray-500 mb-2 tracking-wide">
                      新增字段
                    </p>
                    <AddFieldRow onAdd={handleAddField} compact />
                  </div>
                )}

                <TemplateBodyEditor
                  body={activeTemplate.body}
                  onChange={handleBodyChange}
                  defaultExpanded={activeTemplate.body.length <= 120}
                />
              </div>
            )}
          </section>

          {/* Preview Panel */}
          <section className="flex-1 min-w-0 bg-[#0B0F19] flex flex-col overflow-hidden">
            <div className="shrink-0 px-8 pt-7 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <h2 className="text-[11px] font-semibold text-gray-400 tracking-[0.2em] uppercase">
                  实时预览
                </h2>
                {activeTemplate && (
                  <span className="text-[11px] text-gray-600 tabular-nums tracking-wide ml-1">
                    · {finalPrompt.length} 字符
                  </span>
                )}
              </div>
              {activeTemplate && (
                <button
                  onClick={handleCopy}
                  className="text-[11px] text-gray-500 hover:text-gray-200 transition-colors duration-200 cursor-pointer tracking-wide"
                >
                  {copied ? '已复制' : '复制'}
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 px-8 pb-6 flex flex-col">
              <div className="flex-1 min-h-0 bg-[#050810] rounded-xl border border-white/[0.08] flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.3),0_12px_40px_-8px_rgba(0,0,0,0.5)]">
                <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                  </div>
                  <span className="text-[10px] text-gray-600 tracking-[0.25em] uppercase">
                    prompt · out
                  </span>
                </div>
                <div className="relative flex-1 min-h-0">
                  <div className="absolute inset-0 overflow-y-auto px-6 pt-5 pb-28">
                    {activeTemplate ? (
                      <>
                        <PromptPreview template={activeTemplate} values={values} />
                        <div className="mt-10 pt-5 border-t border-white/[0.05] flex items-center gap-3 text-[10px] text-gray-600 tracking-[0.25em] uppercase">
                          <span className="h-px flex-1 bg-white/[0.04]" />
                          <span>end · {finalPrompt.length} chars</span>
                          <span className="h-px flex-1 bg-white/[0.04]" />
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-600 text-xs">请先选择或创建模板</p>
                    )}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#050810] via-[#050810]/85 to-transparent" />
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* ═══════════════ Drawer Overlay ═══════════════ */}
        {drawerOpen && (
          <div
            className="absolute top-0 right-0 bottom-0 left-10 bg-black/15 z-20 backdrop-enter"
            onClick={() => setDrawerOpen(false)}
          />
        )}
        <aside
          className={`absolute left-10 top-0 bottom-0 w-[320px] bg-white border-r border-gray-200 shadow-[8px_0_24px_-12px_rgba(0,0,0,0.15)] z-30 flex flex-col transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-[calc(100%+40px)]'
          }`}
        >
          <div className="shrink-0 h-12 px-5 flex items-center justify-between border-b border-gray-100">
            <h3 className="text-[13px] font-semibold text-gray-900 tracking-wide">
              模板库
              <span className="ml-1.5 text-[11px] font-normal text-gray-400 tabular-nums">
                {templates.length}
              </span>
            </h3>
            <button
              onClick={() => setDrawerOpen(false)}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none cursor-pointer transition-colors duration-200 w-6 h-6 flex items-center justify-center"
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          {/* Scene segmented */}
          <div className="shrink-0 px-4 pt-4 pb-3">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              {SCENE_IDS.map((s) => {
                const active = activeScene === s;
                const count = templates.filter((t) => t.scene === s).length;
                return (
                  <button
                    key={s}
                    onClick={() => setActiveScene(s)}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer tracking-wide ${
                      active
                        ? 'bg-white text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {SCENE_LABELS[s] ?? s}
                    {count > 0 && (
                      <span
                        className={`ml-1 tabular-nums ${active ? 'text-gray-400' : 'text-gray-300'}`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {templatesInScene.length === 0 ? (
              <div className="px-3 py-8">
                <p className="text-[12px] text-gray-400 leading-relaxed mb-4 text-center tracking-wide">
                  「{SCENE_LABELS[activeScene] ?? activeScene}」还没有模板
                </p>
                <button
                  onClick={handleCreateBlank}
                  className="w-full px-3 py-2.5 text-[12px] font-medium text-gray-900 bg-gray-50 hover:bg-gray-900 hover:text-white border border-gray-200 hover:border-gray-900 rounded-md transition-all duration-200 cursor-pointer tracking-wide"
                >
                  + 新建空白模板
                </button>
                <Link
                  href="/insight"
                  className="block w-full mt-2 px-3 py-2 text-center text-[11px] text-gray-400 hover:text-gray-700 transition-colors duration-200 cursor-pointer tracking-wide"
                >
                  或前往 Insight 分析 ›
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {templatesInScene.map((t) => {
                  const isActive = t.id === activeId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTemplate(t.id)}
                      className={`group relative rounded-lg px-3.5 py-3 cursor-pointer transition-all duration-200 ${
                        isActive
                          ? 'bg-blue-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-full" />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4
                            className={`text-[13px] font-medium truncate tracking-wide ${
                              isActive ? 'text-blue-900' : 'text-gray-700'
                            }`}
                          >
                            {t.name}
                          </h4>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate tracking-wide">
                            {t.cluster || '自定义'} · {t.fields.length} 参数
                          </p>
                        </div>
                        {confirmDeleteId === t.id ? (
                          <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                              className="text-red-500 hover:text-red-600 font-medium cursor-pointer"
                            >
                              确认
                            </button>
                            <span className="text-gray-200">|</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                              className="text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(t.id); }}
                            className="opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-red-500 transition-all duration-200 cursor-pointer shrink-0"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 px-3 py-2.5">
            <button
              onClick={handleCreateBlank}
              className="w-full px-3 py-2 text-[12px] text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors duration-200 cursor-pointer tracking-wide"
            >
              + 新建「{SCENE_LABELS[activeScene] ?? activeScene}」空白模板
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─────── Header button ─────── */
function HeaderBtn({
  children,
  onClick,
  tone = 'default',
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'success';
  disabled?: boolean;
  title?: string;
}) {
  const toneCls =
    tone === 'primary'
      ? 'bg-gray-900 text-white hover:bg-gray-800'
      : tone === 'success'
        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100';
  const disabledCls = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 tracking-wide ${toneCls} ${disabledCls}`}
    >
      {children}
    </button>
  );
}

/* ─────── Sectioned fields ─────── */
function SectionedFields({
  template,
  fields,
  values,
  suggesting,
  suggestError,
  autofilling,
  autofillError,
  onUpdate,
  onToggleQuick,
  onRemoveOption,
  onAddOption,
  onAISuggest,
  onAutofillSection,
  onDismissError,
  onDismissAutofillError,
}: {
  template: ComposerTemplate;
  fields: ComposerField[];
  values: Record<string, string>;
  suggesting: Record<string, boolean>;
  suggestError: Record<string, string>;
  autofilling: Record<string, boolean>;
  autofillError: Record<string, string>;
  onUpdate: (fieldId: string, v: string) => void;
  onToggleQuick: (fieldId: string, v: string) => void;
  onRemoveOption: (fieldId: string, v: string) => void;
  onAddOption: (fieldId: string, v: string) => void;
  onAISuggest: (field: ComposerField) => void;
  onAutofillSection: (
    sectionId: SectionBriefId,
    sectionTitle: string,
    sectionDimensions: string[],
    description: string,
    fieldsInSection: ComposerField[],
  ) => void;
  onDismissError: (fieldId: string) => void;
  onDismissAutofillError: (sectionId: string) => void;
}) {
  const groups = useMemo(() => groupFieldsBySection(fields), [fields]);

  return (
    <div className="space-y-9">
      {groups.map((group, groupIdx) => {
        const orderNum = String(groupIdx + 1).padStart(2, '0');
        const filled = group.fields.filter(
          (f) => (values[f.id] ?? '').trim().length > 0,
        ).length;
        const brief = getSectionBrief(template, group.section.id);
        const isFilling = !!autofilling[group.section.id];
        const fillErr = autofillError[group.section.id];
        return (
          <section key={group.section.id}>
            <SectionHeader
              order={orderNum}
              section={group.section}
              total={group.fields.length}
              filled={filled}
            />
            <SectionAutofill
              accent={group.section.accent}
              dimensions={brief.dimensions}
              example={brief.example}
              loading={isFilling}
              error={fillErr}
              onSubmit={(description) =>
                onAutofillSection(
                  group.section.id,
                  group.section.title,
                  brief.dimensions,
                  description,
                  group.fields,
                )
              }
              onDismissError={() => onDismissAutofillError(group.section.id)}
            />
            <div className="pl-4 mt-4 space-y-5 border-l-[1.5px]" style={{ borderColor: hexWithAlpha(group.section.accent, 0.16) }}>
              {group.fields.map((field, idx) => {
                const v = values[field.id] ?? '';
                const isSug = !!suggesting[field.id];
                const sugErr = suggestError[field.id];
                const isLead = idx === 0;
                return (
                  <FieldCard
                    key={field.id}
                    field={field}
                    accent={group.section.accent}
                    emphasis={isLead ? 'primary' : 'secondary'}
                    value={v}
                    suggesting={isSug}
                    suggestError={sugErr}
                    onChange={(val) => onUpdate(field.id, val)}
                    onToggleQuick={(val) => onToggleQuick(field.id, val)}
                    onRemoveOption={(val) => onRemoveOption(field.id, val)}
                    onAddOption={(val) => onAddOption(field.id, val)}
                    onAISuggest={() => onAISuggest(field)}
                    onDismissError={() => onDismissError(field.id)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ─────── Section autofill entry ─────── */
function SectionAutofill({
  accent,
  dimensions,
  example,
  loading,
  error,
  onSubmit,
  onDismissError,
}: {
  accent: string;
  dimensions: string[];
  example: string;
  loading: boolean;
  error?: string;
  onSubmit: (description: string) => void;
  onDismissError: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const canSubmit = text.trim().length > 0 && !loading;

  const handleSubmit = () => {
    const v = text.trim();
    if (!v) return;
    onSubmit(v);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-dashed transition-all duration-200 cursor-pointer group hover:bg-white"
        style={{
          borderColor: hexWithAlpha(accent, 0.28),
          backgroundColor: hexWithAlpha(accent, 0.04),
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 text-[11px] font-semibold tracking-wide"
            style={{ color: accent }}
          >
            ✨
          </span>
          <span className="text-[12px] font-medium text-gray-700 tracking-wide truncate">
            用一句话告诉 AI 这部分你想要什么
          </span>
        </div>
        <span
          className="shrink-0 text-[11px] font-medium tracking-wide"
          style={{ color: accent }}
        >
          展开 ›
        </span>
      </button>
    );
  }

  return (
    <div
      className="mt-3 rounded-xl border px-4 py-3.5 transition-all duration-200"
      style={{
        borderColor: hexWithAlpha(accent, 0.25),
        backgroundColor: hexWithAlpha(accent, 0.045),
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 text-[11px] font-semibold tracking-wide"
            style={{ color: accent }}
          >
            ✨ AI 帮我写这部分
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="shrink-0 text-[11px] text-gray-400 hover:text-gray-700 transition-colors duration-200 cursor-pointer tracking-wide"
        >
          收起 ‹
        </button>
      </div>

      {dimensions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span className="text-[10px] text-gray-400 tracking-wide mr-0.5">
            可描述:
          </span>
          {dimensions.map((d) => (
            <span
              key={d}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide"
              style={{
                color: accent,
                backgroundColor: hexWithAlpha(accent, 0.12),
              }}
            >
              {d}
            </span>
          ))}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={example ? `例：${example}` : '用人话描述你这部分的想法…'}
        rows={3}
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        className="w-full px-3 py-2 rounded-lg text-[12.5px] text-gray-900 placeholder:text-gray-400 placeholder:leading-relaxed bg-white border focus:outline-none transition-all duration-200 resize-none disabled:opacity-60"
        style={{
          borderColor: hexWithAlpha(accent, 0.28),
        }}
      />

      {error && (
        <div className="mt-2 flex items-start gap-2 text-[11px] bg-red-50/70 border border-red-100 rounded-md px-2.5 py-1.5">
          <span className="text-red-600 flex-1 leading-relaxed">{error}</span>
          <button
            onClick={onDismissError}
            className="text-red-400 hover:text-red-600 cursor-pointer shrink-0 text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-2.5">
        <span className="text-[10px] text-gray-400 tracking-wide">
          {loading ? 'AI 正在拆解你的描述…' : '⌘/Ctrl + Enter 快速提交'}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-3.5 py-1.5 rounded-md text-[11.5px] font-medium text-white transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 tracking-wide"
          style={{ backgroundColor: accent }}
        >
          {loading ? '生成中…' : '✨ 帮我填这部分'}
        </button>
      </div>
    </div>
  );
}

function SectionHeader({
  order,
  section,
  total,
  filled,
}: {
  order: string;
  section: FieldSection;
  total: number;
  filled: number;
}) {
  const pct = total === 0 ? 0 : (filled / total) * 100;
  return (
    <div className="flex items-center gap-3">
      <span
        className="shrink-0 text-[10px] font-bold tabular-nums tracking-[0.25em] px-1.5 py-0.5 rounded"
        style={{
          color: section.accent,
          backgroundColor: hexWithAlpha(section.accent, 0.08),
        }}
      >
        {order}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-gray-900 tracking-wide shrink-0">
            {section.title}
          </h3>
          <div className="flex-1 h-[3px] rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: section.accent,
              }}
            />
          </div>
          <span className="text-[10px] text-gray-400 tabular-nums tracking-wide shrink-0">
            {filled}/{total}
          </span>
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5 tracking-wide">
          {section.hint}
        </p>
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─────── Field Card ─────── */
function FieldCard({
  field,
  accent,
  emphasis,
  value,
  suggesting,
  suggestError,
  onChange,
  onToggleQuick,
  onRemoveOption,
  onAddOption,
  onAISuggest,
  onDismissError,
}: {
  field: ComposerField;
  accent: string;
  emphasis: 'primary' | 'secondary';
  value: string;
  suggesting: boolean;
  suggestError?: string;
  onChange: (v: string) => void;
  onToggleQuick: (v: string) => void;
  onRemoveOption: (v: string) => void;
  onAddOption: (v: string) => void;
  onAISuggest: () => void;
  onDismissError: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMulti = field.multi === true;
  const selectedTags = isMulti ? parseMultiValue(value) : [];
  const isPrimary = emphasis === 'primary';

  const handleToggleTag = useCallback(
    (optValue: string) => {
      if (!isMulti) {
        onToggleQuick(optValue);
        return;
      }
      const has = selectedTags.includes(optValue);
      const next = has
        ? selectedTags.filter((s) => s !== optValue)
        : [...selectedTags, optValue];
      onChange(joinMultiValue(next));
    },
    [isMulti, onToggleQuick, onChange, selectedTags],
  );

  const handleAddCustom = useCallback(
    (raw: string) => {
      const v = raw.trim();
      if (!v) return;
      onAddOption(v);
      if (isMulti && !selectedTags.includes(v)) {
        onChange(joinMultiValue([...selectedTags, v]));
      }
    },
    [onAddOption, isMulti, selectedTags, onChange],
  );

  const labelCls = isPrimary
    ? 'text-[14px] font-semibold text-gray-900'
    : 'text-[12.5px] font-medium text-gray-700';

  const friendlyLabel = field.friendlyLabel?.trim();
  const friendlyHint = field.friendlyHint?.trim();

  return (
    <div className={isPrimary ? '' : 'pt-0.5'}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {isPrimary && (
            <span
              className="w-1 h-1 rounded-full shrink-0 mt-[7px]"
              style={{ backgroundColor: accent }}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <label className={`${labelCls} tracking-wide`}>
                {field.label}
                {friendlyLabel && (
                  <span className="ml-1.5 font-normal text-gray-500 tracking-normal">
                    ：{friendlyLabel}
                  </span>
                )}
              </label>
              {isMulti && (
                <span
                  className="shrink-0 text-[9px] font-semibold tracking-[0.15em] uppercase px-1.5 py-0.5 rounded"
                  style={{
                    color: accent,
                    backgroundColor: hexWithAlpha(accent, 0.1),
                  }}
                >
                  多选
                </span>
              )}
            </div>
            {friendlyHint && (
              <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed tracking-wide">
                {friendlyHint}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onAISuggest}
          disabled={suggesting}
          className={`shrink-0 text-[11px] transition-all duration-200 cursor-pointer disabled:cursor-wait tracking-wide pt-0.5 ${
            field.quickOptions.length === 0
              ? 'font-medium'
              : 'text-gray-400 hover:text-gray-700'
          }`}
          style={
            field.quickOptions.length === 0
              ? { color: accent }
              : undefined
          }
        >
          {suggesting
            ? '生成中···'
            : field.quickOptions.length === 0
              ? '✦ AI 生成候选'
              : '✦ AI 补充'}
        </button>
      </div>

      {field.description && isPrimary && !friendlyHint && (
        <p className="text-[11px] text-gray-500 mb-2 leading-relaxed tracking-wide">
          {field.description}
        </p>
      )}

      {isMulti ? (
        <div
          className="w-full min-h-[40px] px-3 py-2 border rounded-lg text-[12.5px] bg-gray-50/60 transition-all duration-200"
          style={{ borderColor: hexWithAlpha(accent, 0.2) }}
        >
          {selectedTags.length === 0 ? (
            <span className="text-gray-400 tracking-wide">
              点选下方 tag 组合成{field.label}…
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-white"
                  style={{ backgroundColor: accent }}
                >
                  {t}
                  <button
                    onClick={() =>
                      onChange(joinMultiValue(selectedTags.filter((s) => s !== t)))
                    }
                    className="text-white/60 hover:text-white cursor-pointer leading-none"
                    aria-label="移除"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`填入${field.label}…`}
          rows={isPrimary ? 3 : 2}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[12.5px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all duration-200 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`填入${field.label}…`}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[12.5px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all duration-200"
        />
      )}

      {suggestError && (
        <div className="mt-2 flex items-start gap-2 text-[11px] bg-red-50/50 border border-red-100 rounded-md px-2.5 py-1.5">
          <span className="text-red-600 flex-1 leading-relaxed">{suggestError}</span>
          <button
            onClick={onDismissError}
            className="text-red-400 hover:text-red-600 cursor-pointer shrink-0 text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

      {(field.quickOptions.length > 0 || adding) && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {field.quickOptions.map((opt) => {
            const active = isMulti
              ? selectedTags.includes(opt.value)
              : value === opt.value;
            return (
              <div
                key={opt.value}
                className={`group inline-flex items-center rounded-md text-[11px] font-medium border transition-all duration-200 overflow-hidden ${
                  active
                    ? ''
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900'
                }`}
                style={
                  active
                    ? {
                        backgroundColor: accent,
                        color: '#fff',
                        borderColor: accent,
                      }
                    : undefined
                }
              >
                <button
                  onClick={() => handleToggleTag(opt.value)}
                  className="pl-2.5 pr-1 py-1 cursor-pointer tracking-wide"
                  title={opt.value}
                >
                  {opt.label}
                </button>
                <button
                  onClick={() => onRemoveOption(opt.value)}
                  className={`px-1.5 py-1 cursor-pointer transition-all duration-200 leading-none ${
                    active
                      ? 'text-white/60 hover:text-white'
                      : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500'
                  }`}
                  aria-label="删除选项"
                >
                  ×
                </button>
              </div>
            );
          })}
          {adding && (
            <input
              ref={inputRef}
              autoFocus
              onBlur={(e) => { handleAddCustom(e.target.value); setAdding(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { handleAddCustom((e.target as HTMLInputElement).value); setAdding(false); }
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder={isMulti ? '新标签' : '新选项'}
              className="px-2 py-1 text-[11px] border border-blue-300 rounded-md focus:outline-none focus:border-blue-500 min-w-[120px]"
            />
          )}
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="px-2 py-1 text-[11px] text-gray-400 hover:text-gray-700 border border-dashed border-gray-200 hover:border-gray-400 rounded-md transition-all duration-200 cursor-pointer tracking-wide"
            >
              + {isMulti ? '标签' : '候选'}
            </button>
          )}
        </div>
      )}

      {field.quickOptions.length === 0 && !adding && !suggesting && (
        <button
          onClick={() => setAdding(true)}
          className="mt-2.5 text-[11px] text-gray-400 hover:text-gray-700 transition-colors duration-200 cursor-pointer tracking-wide"
        >
          + 手动添加{isMulti ? '标签' : '候选项'}
        </button>
      )}
    </div>
  );
}

/* ─────── Preview ─────── */
function PromptPreview({
  template,
  values,
}: {
  template: ComposerTemplate;
  values: Record<string, string>;
}) {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]\n]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(template.body)) !== null) {
    if (m.index > last) {
      parts.push(
        <span key={key++} className="text-gray-300">
          {template.body.slice(last, m.index)}
        </span>,
      );
    }
    const ph = m[1].trim();
    const field = template.fields.find((f) => f.placeholder === ph);
    const val = field ? (values[field.id] ?? '').trim() : '';
    if (val) {
      parts.push(
        <span
          key={key++}
          className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-200 font-medium"
        >
          {val}
        </span>,
      );
    } else {
      parts.push(
        <span
          key={key++}
          className="text-gray-500 border-b border-dashed border-gray-600/60"
        >
          {ph}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < template.body.length) {
    parts.push(
      <span key={key++} className="text-gray-300">
        {template.body.slice(last)}
      </span>,
    );
  }

  return (
    <div className="font-mono text-[13px] leading-[1.9] whitespace-pre-wrap break-words tracking-wide">
      {parts}
    </div>
  );
}

/* ─────── Template body editor (expandable) ─────── */
function TemplateBodyEditor({
  body,
  onChange,
  defaultExpanded = false,
}: {
  body: string;
  onChange: (v: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);
  return (
    <div className="mt-8 pt-5 border-t border-gray-100">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors duration-200 cursor-pointer tracking-wide"
      >
        {expanded ? '收起' : '展开'}模板文本 {expanded ? '‹' : '›'}
      </button>
      {expanded && (
        <div className="mt-3">
          <textarea
            value={body}
            onChange={(e) => onChange(e.target.value)}
            rows={10}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-[12px] text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all duration-200 resize-y leading-relaxed"
          />
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed tracking-wide">
            使用
            <code className="mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono text-[10px]">
              [变量名]
            </code>
            标注占位符，保存后自动同步字段。
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────── Fields empty state ─────── */
function FieldsEmptyState({
  onAdd,
}: {
  onAdd: (name: string, type: 'input' | 'textarea') => void;
}) {
  return (
    <div className="border border-dashed border-gray-200 rounded-xl px-5 py-6 bg-gray-50/40">
      <h4 className="text-[13px] font-medium text-gray-900 tracking-wide mb-1">
        开始搭建字段
      </h4>
      <p className="text-[11px] text-gray-500 leading-relaxed mb-4 tracking-wide">
        字段用于把 Prompt 中会变化的部分抽取出来（比如「角色」「任务」「风格」）。填入一个名字即可新增，模板文本会自动同步
        <code className="mx-1 px-1 py-0.5 bg-white rounded border border-gray-200 text-gray-600 font-mono text-[10px]">
          [xxx]
        </code>
        占位符。
      </p>
      <AddFieldRow onAdd={onAdd} />
    </div>
  );
}

/* ─────── Add field row ─────── */
function AddFieldRow({
  onAdd,
  compact = false,
}: {
  onAdd: (name: string, type: 'input' | 'textarea') => void;
  compact?: boolean;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'input' | 'textarea'>('input');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(() => {
    const v = name.trim();
    if (!v) {
      setError('请输入字段名');
      return;
    }
    if (v.includes('[') || v.includes(']')) {
      setError('字段名不能包含 [ ]');
      return;
    }
    onAdd(v, type);
    setName('');
    setError('');
  }, [name, type, onAdd]);

  return (
    <div className={compact ? '' : ''}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
            }}
            placeholder={compact ? '新字段名，例：风格' : '输入字段名，例：角色、风格、输出格式…'}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all duration-200"
          />
        </div>
        <div className="flex items-center bg-gray-100 rounded-md p-0.5 shrink-0">
          <button
            onClick={() => setType('input')}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-all duration-200 cursor-pointer tracking-wide ${
              type === 'input'
                ? 'bg-white text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="单行输入"
          >
            单行
          </button>
          <button
            onClick={() => setType('textarea')}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-all duration-200 cursor-pointer tracking-wide ${
              type === 'textarea'
                ? 'bg-white text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="多行输入"
          >
            多行
          </button>
        </div>
        <button
          onClick={handleSubmit}
          className="px-3.5 py-2 bg-gray-900 text-white rounded-md text-[12px] font-medium hover:bg-gray-800 transition-colors duration-200 cursor-pointer tracking-wide shrink-0"
        >
          添加
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-500 mt-1.5 tracking-wide">{error}</p>
      )}
    </div>
  );
}

/* ─────── Empty state ─────── */
function EmptyState({
  onCreate,
  onOpenDrawer,
}: {
  onCreate: () => void;
  onOpenDrawer: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-10 py-16 text-center">
      <h2 className="text-[15px] font-semibold text-gray-900 tracking-wide mb-2">
        还没有模板
      </h2>
      <p className="text-[12px] text-gray-500 leading-relaxed max-w-[300px] mb-6 tracking-wide">
        先去 Insight 分析你的高分 Prompt，再把分析结果一键加入合成器；也可以直接新建空白模板开始配置。
      </p>
      <div className="flex items-center gap-2">
        <Link
          href="/insight"
          className="px-4 py-1.5 bg-gray-900 text-white rounded-md text-[12px] font-medium hover:bg-gray-800 transition-colors duration-200 cursor-pointer tracking-wide"
        >
          前往 Insight
        </Link>
        <button
          onClick={onOpenDrawer}
          className="px-4 py-1.5 border border-gray-200 text-gray-600 rounded-md text-[12px] font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors duration-200 cursor-pointer tracking-wide"
        >
          打开模板库
        </button>
        <button
          onClick={onCreate}
          className="px-4 py-1.5 text-gray-500 hover:text-gray-900 text-[12px] font-medium transition-colors duration-200 cursor-pointer tracking-wide"
        >
          + 新建空白
        </button>
      </div>
    </div>
  );
}

/* ─────── Minimal spinner (no icon) ─────── */
function Spinner() {
  return (
    <div className="flex gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse [animation-delay:300ms]" />
    </div>
  );
}

/* ─────── Page wrapper ─────── */
export default function ComposerPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center bg-[#FAFAFA]">
          <Spinner />
        </div>
      }
    >
      <ComposerInner />
    </Suspense>
  );
}
