'use client';
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Tabs } from '@/components/ui/Tabs';
import { SignalList } from '@/components/signals/SignalList';
import { Badge } from '@/components/ui/Badge';
import { LoadingScreen } from '@/components/ui/Spinner';
import { usePrices } from '@/hooks/usePrices';
import { formatPrice, formatTimeAgo } from '@/lib/utils';
import clsx from 'clsx';

export default function SignalsPage() {
  const { isConnected, lastUpdate } = usePrices();
  const [signals, setSignals] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sigRes, histRes] = await Promise.all([
          fetch('/api/signals?limit=50'),
          fetch('/api/signals/history'),
        ]);
        const sigData = await sigRes.json();
        const histData = await histRes.json();
        setSignals(sigData.signals || []);
        setHistory(histData.signals || []);
        setStats(histData.stats || null);
      } catch (err) {
        console.error('Signals page load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <LoadingScreen text="Loading signals..." />;

  const activeSignals = signals.filter(s => s.direction !== 'NEUTRAL');
  const resolvedHistory = history.filter(s => s.outcome);
  const pendingHistory = history.filter(s => !s.outcome);

  return (
    <div>
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />

      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Signals</h2>
          <p className="text-sm text-zinc-500">
            Active trading signals with full reasoning and historical outcomes
          </p>
        </div>

        <Tabs
          tabs={[
            {
              id: 'active',
              label: 'Active Signals',
              count: activeSignals.length,
              content: <SignalList signals={activeSignals} showReasoning />,
            },
            {
              id: 'pending',
              label: 'Pending Outcomes',
              count: pendingHistory.length,
              content: (
                <HistoryTable
                  signals={pendingHistory}
                  emptyText="No pending signals waiting for resolution"
                />
              ),
            },
            {
              id: 'history',
              label: 'Signal History',
              count: resolvedHistory.length,
              content: (
                <HistoryTable
                  signals={resolvedHistory}
                  emptyText="No resolved signals yet"
                />
              ),
            },
          ]}
          defaultTab="active"
        />
      </div>
    </div>
  );
}

function HistoryTable({ signals, emptyText }) {
  if (signals.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-surface-200">
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Coin</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Direction</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Entry</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Exit</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Outcome</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">P&L</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {signals.map(sig => (
            <tr key={sig.id} className="hover:bg-surface-300/50 transition-colors">
              <td className="px-4 py-3 font-medium text-white">{sig.coin}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={sig.direction?.includes('LONG') ? 'long' : sig.direction?.includes('SHORT') ? 'short' : 'neutral'}
                  size="sm"
                >
                  {sig.direction?.replace('STRONG_', '')}
                </Badge>
              </td>
              <td className="px-4 py-3 font-mono text-zinc-300">{formatPrice(sig.entry)}</td>
              <td className="px-4 py-3 font-mono text-zinc-300">{sig.exitPrice ? formatPrice(sig.exitPrice) : '—'}</td>
              <td className="px-4 py-3">
                {sig.outcome ? (
                  <Badge
                    variant={sig.outcome === 'win' ? 'success' : sig.outcome === 'loss' ? 'danger' : 'warning'}
                    size="sm"
                  >
                    {sig.outcome.toUpperCase()}
                  </Badge>
                ) : (
                  <Badge variant="default" size="sm">PENDING</Badge>
                )}
              </td>
              <td className="px-4 py-3">
                {sig.pnlPercent != null ? (
                  <span className={clsx(
                    'font-mono font-medium',
                    sig.pnlPercent >= 0 ? 'text-long' : 'text-short'
                  )}>
                    {sig.pnlPercent >= 0 ? '+' : ''}{sig.pnlPercent.toFixed(2)}%
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3 text-zinc-500 text-xs">
                {sig.timestamp ? formatTimeAgo(sig.timestamp) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
