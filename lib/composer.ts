import type {
  ClusterInsight,
  ComposerField,
  ComposerFieldOption,
  ComposerTemplate,
  PlaceholderSuggestion,
  SectionBrief,
  SectionBriefId,
} from './types';

const STORAGE_KEY = 'promptory-composer-templates';

const FIELD_COLORS = [
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#10B981',
  '#F43F5E',
  '#06B6D4',
] as const;

export const MULTI_VALUE_JOINER = ' + ';

export interface FieldSection {
  id: 'context' | 'tech' | 'design' | 'output' | 'other';
  title: string;
  hint: string;
  accent: string;
  order: number;
}

const SECTION_MAP: Record<FieldSection['id'], FieldSection> = {
  context: {
    id: 'context',
    title: '场景 · 目标',
    hint: '说清楚「是什么、给谁用」',
    accent: '#2563EB',
    order: 1,
  },
  tech: {
    id: 'tech',
    title: '技术 · 约束',
    hint: '用什么技术栈、什么配置',
    accent: '#7C3AED',
    order: 2,
  },
  design: {
    id: 'design',
    title: '设计 · 视觉',
    hint: '整体风格、色彩、字体与效果',
    accent: '#EA580C',
    order: 3,
  },
  output: {
    id: 'output',
    title: '输出 · 交付',
    hint: '交付格式与具体要求',
    accent: '#059669',
    order: 4,
  },
  other: {
    id: 'other',
    title: '其他',
    hint: '补充信息',
    accent: '#475569',
    order: 5,
  },
};

const SECTION_PATTERNS: Array<{ id: FieldSection['id']; pattern: RegExp }> = [
  { id: 'tech', pattern: /(技术栈|框架|stack|依赖|库|组件|component|library|package|配置项|扩展|tech|集成|integration|api|lint|编译|build|部署|deploy|路由|router|state|状态)/i },
  { id: 'design', pattern: /(风格|色值|色彩|配色|color|palette|字体|font|字号|typography|视觉|特效|effect|动画|animation|CSS|布局|layout|排版|theme|主题|氛围|mood|tone|美学|style|阴影|圆角|间距|spacing|icon|图标|图形|交互效果)/i },
  { id: 'output', pattern: /(输出|交付|格式|format|deliverable|结构|structure|要求|spec|验收|criteria|产物|output|返回|response)/i },
  { id: 'context', pattern: /(项目|产品|品牌|brand|product|类型|goal|目标|任务|task|角色|role|场景|scene|用户|audience|受众|背景|context|description|说明)/i },
];

export function inferFieldSection(field: ComposerField): FieldSection {
  const text = `${field.label} ${field.placeholder} ${field.description ?? ''}`;
  for (const { id, pattern } of SECTION_PATTERNS) {
    if (pattern.test(text)) return SECTION_MAP[id];
  }
  return SECTION_MAP.other;
}

export function getAllSections(): FieldSection[] {
  return Object.values(SECTION_MAP).sort((a, b) => a.order - b.order);
}

export function groupFieldsBySection(fields: ComposerField[]): Array<{
  section: FieldSection;
  fields: ComposerField[];
}> {
  const buckets = new Map<FieldSection['id'], ComposerField[]>();
  for (const f of fields) {
    const s = inferFieldSection(f);
    const arr = buckets.get(s.id) ?? [];
    arr.push(f);
    buckets.set(s.id, arr);
  }
  return getAllSections()
    .filter((s) => buckets.has(s.id))
    .map((s) => ({ section: s, fields: buckets.get(s.id)! }));
}

/**
 * Split a combined value like "React + Vite + TypeScript + Tailwind CSS"
 * or "dark, moody, and cinematic with a warm cream palette" into individual
 * tags.
 * Supported separators: + 、 / & , ; " and " " with " " plus ".
 * Kept as a greedy but safe splitter so legacy long descriptions degrade
 * into roughly atomic tags; users can always edit further.
 */
export function splitCombinedValue(raw: string): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/\s*[+、/&;]\s*|\s*,\s*(?:and\s+)?|\s+and\s+|\s+with\s+|\s+plus\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts;
}

/**
 * Fields that MUST stay as a single free-text box (code, URLs, long descriptions,
 * unique names, etc.) — these override any multi hints in the label.
 */
const SINGLE_STRONG = /(描述|说明|详情|细节|description|detail|介绍|正文|body|代码|code|CSS代码|HTML|script|脚本|品牌名|产品名|项目名|product\s*name|brand\s*name|title|标题|名称|目标|goal|任务|task|要求|规范|流程|步骤)/i;

/**
 * Fields that clearly invite multi-tag composition (style / typography / stack /
 * tags / keywords / modules …). Evaluated after SINGLE_STRONG.
 */
const MULTI_STRONG = /(技术栈|框架|依赖|组件库|扩展|配置项|集成|能力|特性|feature|标签|tag|stack|关键词|keywords|风格|整体风格|调性|氛围|mood|tone|vibe|atmosphere|theme|主题|字体|font|typography|typeface|配色|色板|色彩主题|palette|色值|color(?:\s|$)|colors|模块|section|章节|页面类型|page\s*type|项目类型|project\s*type|受众|audience|场景|scenes?)/i;

/**
 * Heuristic to decide whether a field should render as multi-select tags.
 * Priority:
 *   1. SINGLE_STRONG → never multi (code / descriptions / unique names).
 *   2. MULTI_STRONG  → always multi (style / fonts / stack / tags / modules).
 *   3. Legacy fallback → if most existing options are composite strings, upgrade to multi.
 */
export function shouldBeMulti(field: { label: string; placeholder: string; quickOptions: ComposerFieldOption[] }): boolean {
  const text = `${field.label} ${field.placeholder}`;
  if (SINGLE_STRONG.test(text)) return false;
  if (MULTI_STRONG.test(text)) return true;
  const opts = field.quickOptions ?? [];
  if (opts.length < 2) return false;
  const composite = opts.filter((o) => /(\s\+\s|、|,\s|\s&\s|\sand\s)/i.test(o.value)).length;
  return composite / opts.length >= 0.5;
}

/**
 * Given a field's quickOptions, possibly expand any composite entries into
 * individual tags. Deduplicates while preserving order.
 */
export function expandMultiOptions(options: ComposerFieldOption[]): ComposerFieldOption[] {
  const seen = new Set<string>();
  const out: ComposerFieldOption[] = [];
  for (const o of options) {
    const parts = splitCombinedValue(o.value);
    const tokens = parts.length > 1 ? parts : [o.value];
    for (const t of tokens) {
      const v = t.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push({
        label: v.length > 16 ? v.slice(0, 16) + '…' : v,
        value: v,
      });
    }
  }
  return out;
}

/** Parse a multi value back into a set of selected tags. */
export function parseMultiValue(raw: string): string[] {
  return splitCombinedValue(raw);
}

/** Build a multi value from selected tags. */
export function joinMultiValue(selected: string[]): string {
  return selected.filter((s) => s.trim().length > 0).join(MULTI_VALUE_JOINER);
}

export function getFieldHighlight(color: string): {
  bg: string;
  text: string;
  placeholder: string;
} {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return {
    bg: `rgba(${r},${g},${b},0.14)`,
    text: lighten(r, g, b, 0.55),
    placeholder: `rgba(${r},${g},${b},0.5)`,
  };
}

function lighten(r: number, g: number, b: number, amount: number): string {
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parsePlaceholders(body: string): string[] {
  const re = /\[([^\]\n]+)\]/g;
  const seen = new Set<string>();
  const result: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/**
 * Strip trailing "例如 / 如 / e.g." example fragments out of a placeholder name.
 *
 * Examples:
 *   "技术栈，如：React + Vite + TypeScript + Tailwind"  → "技术栈"
 *   "URL或图标库名，如：lucide-react (ArrowRight)"       → "URL或图标库名"
 *   "Hover/Focus状态，如：hover:scale-110 transition"    → "Hover/Focus状态"
 *   "代码组织，如：separate components for Navbar..."     → "代码组织"
 *   "项目类型"                                           → "项目类型"
 *   "Google Fonts链接、字重及对应用途"                    → "Google Fonts链接、字重及对应用途"
 *
 * We only strip when an explicit "example lead-in" keyword is present, so we
 * don't accidentally eat descriptive names that merely contain a colon.
 */
export function cleanPlaceholderName(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();
  const cn = s.match(/^(.+?)\s*[,，、（(]\s*(?:如|例如|比如|示例|举例)\s*[:：].*$/u);
  if (cn && cn[1].trim()) return cn[1].trim();
  const en = s.match(
    /^(.+?)\s*[,，]\s*(?:e\.g\.|eg\.|ex\.|i\.e\.|for\s+example|example)\s*[:：]?\s.*$/i,
  );
  if (en && en[1].trim()) return en[1].trim();
  const colonLong = s.match(/^([^:：,，]{2,18})\s*[:：]\s*(.+)$/u);
  if (colonLong) {
    const after = colonLong[2];
    if (after.length > 18 || /[+,，、]/.test(after)) {
      return colonLong[1].trim();
    }
  }
  return s;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace every `[rawName]` in the body with `[cleanName]`.
 * Used when migrating legacy data / newly generated templates so that the
 * placeholder tokens in the body always match `ComposerField.placeholder`
 * after cleaning.
 */
function rewriteBodyPlaceholder(body: string, rawName: string, cleanName: string): string {
  if (rawName === cleanName) return body;
  const pattern = new RegExp(`\\[${escapeRegExp(rawName)}\\]`, 'g');
  return body.replace(pattern, `[${cleanName}]`);
}

/**
 * Decide whether a (cleaned) placeholder name is actually a usable field
 * label. Catches three kinds of broken placeholders seen in legacy / LLM
 * output where the model wrapped the wrong thing in `[...]`:
 *
 *   - Pure example blobs:     "如：bg-black, min-h-screen, max-w-6xl mx-auto"
 *   - Section headings:       "SECTION 1: HERO", "第一部分 介绍"
 *   - Garbage / degenerate:   "", "?", "xxx" (超长 / 1 字)
 */
function isBadPlaceholder(cleaned: string): boolean {
  const s = cleaned.trim();
  if (!s) return true;
  if (s.length <= 1) return true;
  if (s.length > 24) return true;
  if (/^\s*(如|例如|比如|示例|举例|例)\s*[:：]/u.test(s)) return true;
  if (/^\s*(e\.g\.|eg\.|ex\.|for\s+example|example)\b/i.test(s)) return true;
  if (/^section\s+\d+\b/i.test(s)) return true;
  if (/^part\s+\d+\b/i.test(s)) return true;
  if (/^第\s*[一二三四五六七八九十百千\d]+\s*(部分|章|节|页|步)/u.test(s)) return true;
  return false;
}

/**
 * Replace every `[rawName]` in the body with plain text (no brackets), so the
 * bad placeholder becomes a regular piece of prose / heading / example.
 *
 *   "[如：bg-black, min-h-screen]" → "bg-black, min-h-screen"   (strip 如：)
 *   "[SECTION 1: HERO]"            → "SECTION 1: HERO"           (as-is)
 */
function unwrapBadPlaceholder(body: string, rawName: string): string {
  const pattern = new RegExp(`\\[${escapeRegExp(rawName)}\\]`, 'g');
  let inner = rawName.trim();
  const stripped = inner.match(
    /^\s*(?:如|例如|比如|示例|举例|例|e\.g\.?|eg\.?|ex\.?|for\s+example|example)\s*[:：]\s*(.+)$/iu,
  );
  if (stripped && stripped[1].trim()) {
    inner = stripped[1].trim();
  }
  return body.replace(pattern, inner);
}

function guessFieldType(placeholder: string, body: string): 'input' | 'textarea' {
  const longHints = ['模块', '组件', '要求', '说明', '描述', '流程', '步骤', '排版', '布局', '内容', '细节'];
  if (longHints.some((h) => placeholder.includes(h))) return 'textarea';
  const token = `[${placeholder}]`;
  const idx = body.indexOf(token);
  if (idx >= 0) {
    const before = body.slice(Math.max(0, idx - 30), idx);
    if (before.endsWith('\n') || before.endsWith(':') || before.endsWith('：')) {
      return 'textarea';
    }
  }
  return 'input';
}

export function insightToTemplate(
  insight: ClusterInsight,
  scene: string,
): ComposerTemplate {
  const rawPlaceholders = parsePlaceholders(insight.bestTemplate);

  type PhEntry = { raw: string; clean: string; bad: boolean };
  const entries: PhEntry[] = rawPlaceholders.map((raw) => {
    const clean = cleanPlaceholderName(raw);
    return { raw, clean, bad: isBadPlaceholder(clean) };
  });

  let cleanBody = insight.bestTemplate;
  for (const e of entries) {
    cleanBody = e.bad
      ? unwrapBadPlaceholder(cleanBody, e.raw)
      : rewriteBodyPlaceholder(cleanBody, e.raw, e.clean);
  }

  // Ordered list of good cleaned names, deduped.
  const orderedCleans: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.bad) continue;
    if (!seen.has(e.clean)) {
      seen.add(e.clean);
      orderedCleans.push(e.clean);
    }
  }

  // Suggestion lookup keyed by the cleaned name so both raw-keyed and
  // clean-keyed AI responses work. Bad placeholders are dropped.
  const sugMap = new Map<string, PlaceholderSuggestion>();
  for (const s of insight.placeholders ?? []) {
    const key = cleanPlaceholderName(s.placeholder.trim());
    if (isBadPlaceholder(key)) continue;
    if (!sugMap.has(key)) sugMap.set(key, s);
  }

  const fields: ComposerField[] = orderedCleans.map((ph, i) => {
    const sug = sugMap.get(ph);
    const rawOptions: ComposerFieldOption[] = (sug?.quickOptions ?? []).map((val) => ({
      label: val.length > 14 ? val.slice(0, 14) + '…' : val,
      value: val,
    }));
    const multi = shouldBeMulti({ label: ph, placeholder: ph, quickOptions: rawOptions });
    const quickOptions = multi ? expandMultiOptions(rawOptions) : rawOptions;
    return {
      id: makeId(),
      label: ph,
      placeholder: ph,
      description: sug?.description,
      friendlyLabel: sug?.friendlyLabel,
      friendlyHint: sug?.friendlyHint,
      type: guessFieldType(ph, cleanBody),
      quickOptions,
      color: FIELD_COLORS[i % FIELD_COLORS.length],
      multi,
    };
  });

  const now = new Date().toISOString();
  return {
    id: makeId(),
    name: `${insight.cluster} · ${new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    scene,
    cluster: insight.cluster,
    body: cleanBody,
    fields,
    sectionBriefs: insight.sectionBriefs,
    sourceInsightAt: insight.analyzedAt,
    createdAt: now,
    updatedAt: now,
  };
}

/* ────────────────────────────────────────────────────────────── */
/*  Section brief (default fallback + accessor)                  */
/* ────────────────────────────────────────────────────────────── */

/**
 * Fallback section briefs used when the template has none (old templates or
 * blank templates). They offer generic "describe these dimensions" prompts
 * so the SectionAutofill entry still works.
 */
const DEFAULT_SECTION_BRIEFS: Record<SectionBriefId, SectionBrief> = {
  context: {
    dimensions: ['项目类型', '目标用户', '产品定位', '核心卖点'],
    example: '给独立开发者做一个 AI 写作工具的官网 landing，要突出订阅转化，用户主要是技术博主。',
  },
  tech: {
    dimensions: ['框架', '样式方案', '动画库', '组件库', '状态管理'],
    example: '用 React + Vite + TypeScript，样式用 Tailwind + shadcn/ui，动画用 framer-motion。',
  },
  design: {
    dimensions: ['色调', '氛围', '字体', '主色', '排版风格'],
    example:
      '想要深色调科幻感，主色亮蓝 #0A84FF 带一点霓虹紫，字体正文用 Inter，大标题用 Instrument Serif，整体是 Awwwards 那种大胆留白的编辑感。',
  },
  output: {
    dimensions: ['页面结构', '模块组成', '输出格式', '验收要求'],
    example: '输出一个单页 landing，结构是 Hero / Features / Pricing / FAQ，要求整段 HTML + Tailwind 类名。',
  },
  other: {
    dimensions: ['交互细节', '特殊效果', '需注意的点'],
    example: '希望 Hero 有个动态渐变背景，按钮 hover 时轻微放大，滚动到 Features 时卡片依次淡入。',
  },
};

/** Merge template-specific briefs with the built-in defaults. */
export function getSectionBrief(
  template: ComposerTemplate | null | undefined,
  sectionId: SectionBriefId,
): SectionBrief {
  const override = template?.sectionBriefs?.[sectionId];
  const defaultBrief = DEFAULT_SECTION_BRIEFS[sectionId];
  if (!override) return defaultBrief;
  return {
    dimensions: override.dimensions.length > 0 ? override.dimensions : defaultBrief.dimensions,
    example: override.example || defaultBrief.example,
  };
}

export function createBlankTemplate(scene: string): ComposerTemplate {
  const body = '请作为[角色]，帮我完成[任务]，要求：[具体要求]。';
  const placeholders = parsePlaceholders(body);
  const fields: ComposerField[] = placeholders.map((ph, i) => ({
    id: makeId(),
    label: ph,
    placeholder: ph,
    type: guessFieldType(ph, body),
    quickOptions: [],
    color: FIELD_COLORS[i % FIELD_COLORS.length],
  }));
  const now = new Date().toISOString();
  return {
    id: makeId(),
    name: '未命名模板',
    scene,
    cluster: '',
    body,
    fields,
    createdAt: now,
    updatedAt: now,
  };
}

export function createFieldFromPlaceholder(placeholder: string, type: 'input' | 'textarea' = 'input'): ComposerField {
  const multi = shouldBeMulti({
    label: placeholder,
    placeholder,
    quickOptions: [],
  });
  return {
    id: makeId(),
    label: placeholder,
    placeholder,
    type,
    quickOptions: [],
    color: FIELD_COLORS[Math.floor(Math.random() * FIELD_COLORS.length)],
    multi,
  };
}

export function renderPrompt(
  template: ComposerTemplate,
  values: Record<string, string>,
): string {
  return template.body.replace(/\[([^\]\n]+)\]/g, (_full, raw) => {
    const key = String(raw).trim();
    const field = template.fields.find((f) => f.placeholder === key);
    if (!field) return `[${key}]`;
    const v = values[field.id]?.trim();
    return v || `[${key}]`;
  });
}

/**
 * Lazily upgrade legacy fields:
 * - Attach an inferred `multi` flag if missing
 * - Expand composite quickOptions like "React + Vite + TypeScript" into
 *   independent tags the first time a template is loaded.
 *
 * Non-destructive: fields that already declare `multi` are left alone.
 */
function migrateLegacyField(field: ComposerField): ComposerField {
  if (field.multi !== undefined) return field;
  const wantsMulti = shouldBeMulti({
    label: field.label,
    placeholder: field.placeholder,
    quickOptions: field.quickOptions,
  });
  if (!wantsMulti) return { ...field, multi: false };
  return {
    ...field,
    quickOptions: expandMultiOptions(field.quickOptions),
    multi: true,
  };
}

/**
 * Template-level migration that cleans placeholder names and drops broken
 * placeholders that legacy generators wrote, including:
 *
 *   "[技术栈，如：React + Vite + TypeScript]"  → field label "技术栈"
 *   "[SECTION 1: HERO]"                         → dropped, body keeps "SECTION 1: HERO"
 *   "[如：bg-black, min-h-screen]"              → dropped, body keeps "bg-black, min-h-screen"
 *
 * Returns the migrated template and a `changed` flag that drives a re-persist
 * from `loadComposerTemplates`.
 */
function migrateLegacyTemplate(t: ComposerTemplate): {
  template: ComposerTemplate;
  changed: boolean;
} {
  let body = t.body;
  let changed = false;
  const newFields: ComposerField[] = [];
  for (const f of t.fields) {
    const cleanPh = cleanPlaceholderName(f.placeholder);
    if (isBadPlaceholder(cleanPh)) {
      body = unwrapBadPlaceholder(body, f.placeholder);
      changed = true;
      continue;
    }
    const cleanLbl = cleanPlaceholderName(f.label);
    let next = f;
    if (cleanPh !== f.placeholder) {
      body = rewriteBodyPlaceholder(body, f.placeholder, cleanPh);
      next = { ...next, placeholder: cleanPh, label: cleanLbl };
      changed = true;
    } else if (cleanLbl !== f.label) {
      next = { ...next, label: cleanLbl };
      changed = true;
    }
    if (next.multi === undefined) {
      const multiMigrated = migrateLegacyField(next);
      if (multiMigrated !== next) {
        next = multiMigrated;
        changed = true;
      }
    }
    newFields.push(next);
  }
  return changed
    ? { template: { ...t, body, fields: newFields }, changed: true }
    : { template: t, changed: false };
}

export function loadComposerTemplates(): ComposerTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const templates = parsed as ComposerTemplate[];
    let mutated = false;
    const migrated = templates.map((t) => {
      const { template: mt, changed } = migrateLegacyTemplate(t);
      if (changed) mutated = true;
      return mt;
    });
    if (mutated) persistComposerTemplates(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export function persistComposerTemplates(list: ComposerTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded, ignore */
  }
}

export function saveComposerTemplate(template: ComposerTemplate): ComposerTemplate {
  const all = loadComposerTemplates();
  const idx = all.findIndex((t) => t.id === template.id);
  const next = { ...template, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    all[idx] = next;
  } else {
    all.unshift(next);
  }
  persistComposerTemplates(all);
  return next;
}

export function deleteComposerTemplate(id: string): void {
  const all = loadComposerTemplates().filter((t) => t.id !== id);
  persistComposerTemplates(all);
}
