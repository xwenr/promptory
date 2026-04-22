'use client';

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { ImagePlus, X } from 'lucide-react';

interface ImageUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
}

export default function ImageUpload({ files, onChange, maxFiles = 5 }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const accepted = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
      const remaining = maxFiles - files.length;
      if (remaining <= 0) return;
      onChange([...files, ...accepted.slice(0, remaining)]);
    },
    [files, onChange, maxFiles],
  );

  const removeImage = useCallback(
    (index: number) => {
      onChange(files.filter((_, i) => i !== index));
    },
    [files, onChange],
  );

  return (
    <div className="space-y-3">
      {/* Thumbnails */}
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {previews.map((src, i) => (
            <div
              key={i}
              className="relative group w-[72px] h-[72px] rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm"
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X size={10} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {files.length < maxFiles && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-50/50'
              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          <ImagePlus size={20} className={`mx-auto mb-1.5 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="text-xs text-gray-500">点击或拖拽上传参考图片</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            最多 {maxFiles} 张 · 支持 JPG / PNG / WebP
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
