'use client';
import clsx from 'clsx';

const INDICATOR_OPTIONS = [
  { id: 'ema', label: 'EMA', color: '#f59e0b' },
  { id: 'bollingerBands', label: 'Bollinger', color: '#71717a' },
  { id: 'ichimoku', label: 'Ichimoku', color: '#06b6d4' },
  { id: 'volume', label: 'Volume', color: '#8b5cf6' },
];

export function IndicatorPanel({ enabled, onToggle }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-500 mr-1">Overlays:</span>
      {INDICATOR_OPTIONS.map(ind => (
        <button
          key={ind.id}
          onClick={() => onToggle(ind.id)}
          className={clsx(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
            enabled[ind.id]
              ? 'border-zinc-600 text-zinc-200 bg-surface-300'
              : 'border-zinc-800 text-zinc-600 bg-transparent hover:text-zinc-400'
          )}
        >
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: enabled[ind.id] ? ind.color : '#3f3f46' }}
          />
          {ind.label}
        </button>
      ))}
    </div>
  );
}
