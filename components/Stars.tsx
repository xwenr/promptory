'use client';

import { Star } from 'lucide-react';

export default function Stars({ score, size = 12 }: { score: number; size?: number }) {
  return (
    <span className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          fill={s <= score ? 'currentColor' : 'none'}
          className={s <= score ? 'text-amber-400' : 'text-gray-200 dark:text-gray-600'}
        />
      ))}
    </span>
  );
}
