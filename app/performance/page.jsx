'use client';
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardTitle, CardValue } from '@/components/ui/Card';
import { IndicatorPerf } from '@/components/dashboard/IndicatorPerf';
import { WinRateChart } from '@/components/dashboard/WinRateChart';
import { LoadingScreen } from '@/components/ui/Spinner';
import { usePrices } from '@/hooks/usePrices';
import clsx from 'clsx';

export default function PerformancePage() {
  const { isConnected, lastUpdate } = usePrices();
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/learning');
        const data = await res.json();
        setLearning(data);
      } catch (err) {
        console.error('Performance page load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleReset = async () => {
    if (!confirm('Reset all learning weights to defaults? Signal history will be preserved.')) return;
    try {
      await fetch('/api/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const res = await fetch('/api/learning');
      const data = await res.json();
      setLearning(data);
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  if (loading) return <LoadingScreen text="Loading performance data..." />;

  const stats = learning?.stats || {};
  const coinPerf = stats.coinPerformance || {};
  const coinEntries = Object.entries(coinPerf)
    .map(([coin, data]) => ({ coin, ...data }))
    .sort((a, b) => b.totalPnl - a.totalPnl);

  return (
    <div>
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />

      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Performance & Learning</h2>
            <p className="text-sm text-zinc-500">
              Track signal accuracy and adaptive weight optimization
            </p>
          </div>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 bg-surface-300 border border-zinc-700 rounded-lg text-sm text-zinc-400 hover:text-short hover:border-short/50 transition-colors"
          >
            Reset Weights
          </button>
        </div>

        {/* Overall stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader><CardTitle>Total Signals</CardTitle></CardHeader>
            <CardValue>{stats.totalSignals || 0}</CardValue>
          </Card>
          <Card>
            <CardHeader><CardTitle>Win Rate</CardTitle></CardHeader>
            <CardValue className={stats.winRate > 0.5 ? 'text-long' : stats.winRate > 0 ? 'text-short' : ''}>
              {stats.winRate != null ? `${(stats.winRate * 100).toFixed(1)}%` : 'N/A'}
            </CardValue>
            <div className="text-xs text-zinc-500 mt-1">
              {stats.wins || 0}W / {stats.losses || 0}L / {stats.expired || 0}E
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Avg Win</CardTitle></CardHeader>
            <CardValue className="text-long">
              {stats.avgProfit ? `+${stats.avgProfit.toFixed(2)}%` : 'N/A'}
            </CardValue>
          </Card>
          <Card>
            <CardHeader><CardTitle>Avg Loss</CardTitle></CardHeader>
            <CardValue className="text-short">
              {stats.avgLoss ? `-${stats.avgLoss.toFixed(2)}%` : 'N/A'}
            </CardValue>
          </Card>
          <Card>
            <CardHeader><CardTitle>Profit Factor</CardTitle></CardHeader>
            <CardValue className={stats.profitFactor > 1 ? 'text-long' : 'text-zinc-400'}>
              {stats.profitFactor != null
                ? stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)
                : 'N/A'}
            </CardValue>
          </Card>
        </div>

        {/* Learning parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">SL ATR Multiplier</div>
            <div className="text-lg font-mono font-bold text-zinc-200">
              {learning?.atrMultiplierSL?.toFixed(2) || '1.50'}x
            </div>
            <div className="text-xs text-zinc-600 mt-1">Auto-adjusted based on loss rate</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">R:R Multiplier</div>
            <div className="text-lg font-mono font-bold text-zinc-200">
              {learning?.rrMultiplier?.toFixed(2) || '1.50'}x
            </div>
            <div className="text-xs text-zinc-600 mt-1">Risk/reward ratio target</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Last Optimized</div>
            <div className="text-lg font-mono font-bold text-zinc-200">
              {learning?.lastOptimized
                ? new Date(learning.lastOptimized).toLocaleDateString()
                : 'Never'}
            </div>
            <div className="text-xs text-zinc-600 mt-1">
              Optimizes every {20} resolved signals
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IndicatorPerf
            weights={learning?.weights}
            accuracy={stats.indicatorAccuracy}
          />
          <WinRateChart weightHistory={learning?.weightHistory} />
        </div>

        {/* Per-coin performance */}
        {coinEntries.length > 0 && (
          <Card>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Per-Coin Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Coin</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Trades</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Win Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Total P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {coinEntries.map(entry => (
                    <tr key={entry.coin} className="hover:bg-surface-300/50">
                      <td className="px-3 py-2 font-medium text-white">{entry.coin}</td>
                      <td className="px-3 py-2 text-zinc-400">{entry.totalTrades}</td>
                      <td className="px-3 py-2">
                        <span className={clsx(
                          'font-mono',
                          entry.winRate > 0.55 ? 'text-long' : entry.winRate < 0.45 ? 'text-short' : 'text-zinc-400'
                        )}>
                          {(entry.winRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={clsx(
                          'font-mono font-medium',
                          entry.totalPnl >= 0 ? 'text-long' : 'text-short'
                        )}>
                          {entry.totalPnl >= 0 ? '+' : ''}{entry.totalPnl.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
