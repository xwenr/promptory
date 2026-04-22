'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { Highlighter } from 'lucide-react';

function parseSegments(text: string): string[] {
  return text.split(/(\{\{[^}]*\}\})/g);
}

/* ── Read-only display with highlighted dynamic parts ── */

export function HighlightDisplay({ content, className }: { content: string; className?: string }) {
  const segments = parseSegments(content);
  return (
    <div className={className}>
      {segments.map((seg, i) => {
        if (seg.startsWith('{{') && seg.endsWith('}}')) {
          const inner = seg.slice(2, -2);
          return (
            <span
              key={i}
              className="bg-amber-100/80 text-amber-800 px-1 py-0.5 rounded font-semibold border border-amber-200/60 mx-0.5"
            >
              {inner}
            </span>
          );
        }
        return <React.Fragment key={i}>{seg}</React.Fragment>;
      })}
    </div>
  );
}

/* ── Editable highlight editor with overlay technique ── */

interface HighlightEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function HighlightEditor({
  value,
  onChange,
  placeholder,
  minHeight = 300,
}: HighlightEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const syncHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.max(ta.scrollHeight, minHeight);
    ta.style.height = `${next}px`;
  }, [minHeight]);

  useEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const wrapSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    if (s === e) return;

    const before = value.slice(0, s);
    const selected = value.slice(s, e);
    const after = value.slice(e);

    if (selected.startsWith('{{') && selected.endsWith('}}')) {
      const unwrapped = selected.slice(2, -2);
      onChange(before + unwrapped + after);
      requestAnimationFrame(() => {
        ta.selectionStart = s;
        ta.selectionEnd = s + unwrapped.length;
        ta.focus();
      });
    } else {
      onChange(before + '{{' + selected + '}}' + after);
      requestAnimationFrame(() => {
        ta.selectionStart = s;
        ta.selectionEnd = e + 4;
        ta.focus();
      });
    }
  }, [value, onChange]);

  const segments = parseSegments(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={wrapSelection}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/80 hover:bg-amber-100 hover:border-amber-300 transition-colors cursor-pointer"
          title="选中文本后点击，标记为动态变量"
        >
          <Highlighter size={13} /> 标记动态文本
        </button>
        <span className="text-[11px] text-gray-400">
          选中文字后点击 · 或手动输入{' '}
          <code className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">{'{{文字}}'}</code>
        </span>
      </div>

      <div
        className="relative rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden hover:border-gray-300 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-colors"
        style={{ minHeight }}
      >
        {/* Backdrop: matches textarea size, highlights {{...}} */}
        <div
          ref={backdropRef}
          className="absolute inset-0 overflow-hidden pointer-events-none px-4 py-3.5 text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-words"
          aria-hidden="true"
        >
          {segments.map((seg, i) => {
            if (seg.startsWith('{{') && seg.endsWith('}}')) {
              return (
                <span key={i} className="bg-amber-200/60 text-transparent rounded-sm">
                  {seg}
                </span>
              );
            }
            return (
              <span key={i} className="text-transparent">
                {seg}
              </span>
            );
          })}
          {'\n'}
        </div>

        {/* Textarea: auto-grows to fit content */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder={placeholder}
          className="relative z-10 w-full px-4 py-3.5 text-[13px] leading-relaxed font-mono resize-none bg-transparent outline-none placeholder:text-gray-400 text-gray-800"
          style={{ caretColor: '#1f2937', minHeight, overflow: 'hidden' }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          用{' '}
          <code className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">{'{{...}}'}</code>{' '}
          包裹动态内容 · 支持 Markdown
        </span>
        <span className="text-[11px] text-gray-400">{value.length} 字符</span>
      </div>
    </div>
  );
}
