'use client';
import { useState } from 'react';
import clsx from 'clsx';
import { Badge } from '@/components/ui/Badge';

export function ReasoningPanel({ reasoning, compact = false }) {
  const [expanded, setExpanded] = useState(!compact);

  if (!reasoning) return null;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors w-full text-left"
      >
        <svg
          className={clsx('w-4 h-4 transition-transform', expanded && 'rotate-90')}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-medium">Signal Reasoning</span>
        {reasoning.riskLevel && (
          <Badge
            variant={reasoning.riskLevel === 'low' ? 'success' : reasoning.riskLevel === 'medium' ? 'warning' : 'danger'}
            size="sm"
          >
            {reasoning.riskLevel} risk
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 animate-slide-up">
          <p className="text-sm text-zinc-300 bg-surface-300 rounded-lg p-3">
            {reasoning.summary}
          </p>

          {reasoning.timeframes && (
            <div className="flex gap-2 flex-wrap">
              {Object.entries(reasoning.timeframes).map(([tf, dir]) => (
                <div
                  key={tf}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border',
                    dir.includes('long') || dir.includes('bullish')
                      ? 'bg-long-bg border-long/20 text-long'
                      : dir.includes('short') || dir.includes('bearish')
                        ? 'bg-short-bg border-short/20 text-short'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  )}
                >
                  <span className="font-mono font-medium">{tf.toUpperCase()}</span>
                  <span>{dir}</span>
                </div>
              ))}
            </div>
          )}

          {reasoning.indicators && reasoning.indicators.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Indicator Breakdown</p>
              <div className="grid gap-1.5">
                {reasoning.indicators.map((ind, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-surface-300 rounded-lg p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div
                        className={clsx(
                          'w-1.5 h-1.5 rounded-full flex-shrink-0',
                          ind.signal === 'bullish' ? 'bg-long' : ind.signal === 'bearish' ? 'bg-short' : 'bg-zinc-500'
                        )}
                      />
                      <span className="font-medium text-zinc-200">{ind.name}</span>
                    </div>
                    <span className="text-zinc-400 flex-1">{ind.detail}</span>
                    <span className={clsx(
                      'font-mono flex-shrink-0',
                      ind.score > 0 ? 'text-long' : ind.score < 0 ? 'text-short' : 'text-zinc-500'
                    )}>
                      {ind.score > 0 ? '+' : ''}{ind.score?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
