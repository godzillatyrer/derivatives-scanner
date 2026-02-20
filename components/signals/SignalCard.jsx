'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { SignalBadge } from './SignalBadge';
import { ReasoningPanel } from './ReasoningPanel';
import { formatPrice, formatTimeAgo, getConfidenceColor } from '@/lib/utils';

export function SignalCard({ signal, showReasoning = true, compact = false }) {
  if (!signal) return null;

  const isLong = signal.direction?.includes('LONG');
  const isShort = signal.direction?.includes('SHORT');

  return (
    <Card
      className={clsx(
        'border-l-2',
        isLong ? 'border-l-long' : isShort ? 'border-l-short' : 'border-l-zinc-600'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/coin/${signal.coin}`}
            className="text-lg font-bold text-white hover:text-accent transition-colors"
          >
            {signal.coin}
          </Link>
          <SignalBadge direction={signal.direction} />
        </div>
        <div className="text-right">
          <div className={clsx('text-xl font-mono font-bold', getConfidenceColor(signal.confidence))}>
            {signal.confidence}%
          </div>
          <div className="text-xs text-zinc-500">confidence</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <PriceField label="Entry" value={signal.entry} />
        <PriceField
          label="Stop Loss"
          value={signal.stopLoss}
          className="text-short"
        />
        {signal.takeProfits?.map((tp, i) => (
          <PriceField
            key={i}
            label={`TP${i + 1}`}
            value={tp}
            className="text-long"
          />
        ))}
      </div>

      {signal.riskPercent && (
        <div className="flex items-center gap-4 mb-3 text-xs text-zinc-500">
          <span>Risk: {signal.riskPercent}%</span>
          {signal.atr && <span>ATR: {formatPrice(signal.atr)}</span>}
          {signal.timestamp && <span>{formatTimeAgo(signal.timestamp)}</span>}
        </div>
      )}

      {showReasoning && <ReasoningPanel reasoning={signal.reasoning} compact={compact} />}
    </Card>
  );
}

function PriceField({ label, value, className }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className={clsx('text-sm font-mono font-medium', className || 'text-zinc-200')}>
        {formatPrice(value)}
      </div>
    </div>
  );
}
