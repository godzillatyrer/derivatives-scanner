'use client';
import Link from 'next/link';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { SignalBadge } from '@/components/signals/SignalBadge';
import { formatPrice, getConfidenceColor } from '@/lib/utils';

export function TopSignals({ signals }) {
  const top = (signals || [])
    .filter(s => s.direction !== 'NEUTRAL')
    .slice(0, 8);

  if (top.length === 0) {
    return (
      <Card>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Top Signals</h3>
        <p className="text-zinc-500 text-sm text-center py-6">No active signals</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Top Signals</h3>
      <div className="space-y-2">
        {top.map(s => (
          <Link
            key={s.coin}
            href={`/coin/${s.coin}`}
            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-300 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-white group-hover:text-accent transition-colors">
                {s.coin}
              </span>
              <SignalBadge direction={s.direction} size="sm" />
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-sm text-zinc-300">
                {formatPrice(s.entry)}
              </span>
              <span className={clsx('font-mono text-sm font-medium', getConfidenceColor(s.confidence))}>
                {s.confidence}%
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
