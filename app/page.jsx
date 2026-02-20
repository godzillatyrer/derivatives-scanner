'use client';
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { StatsBar } from '@/components/layout/StatsBar';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { TopSignals } from '@/components/dashboard/TopSignals';
import { IndicatorPerf } from '@/components/dashboard/IndicatorPerf';
import { WinRateChart } from '@/components/dashboard/WinRateChart';
import { LoadingScreen } from '@/components/ui/Spinner';
import { usePrices } from '@/hooks/usePrices';

export default function Dashboard() {
  const { isConnected, lastUpdate } = usePrices();
  const [signals, setSignals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sigRes, learnRes] = await Promise.all([
          fetch('/api/signals?limit=30'),
          fetch('/api/learning'),
        ]);
        const sigData = await sigRes.json();
        const learnData = await learnRes.json();
        setSignals(sigData.signals || []);
        setMeta(sigData.meta || null);
        setLearning(learnData);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <LoadingScreen text="Scanning markets..." />;

  return (
    <div>
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />
      <StatsBar stats={meta} />

      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Dashboard</h2>
          <p className="text-sm text-zinc-500">Real-time overview of Hyperliquid trading signals</p>
        </div>

        <SummaryCards meta={meta} learningStats={learning?.stats} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopSignals signals={signals} />
          <IndicatorPerf
            weights={learning?.weights}
            accuracy={learning?.stats?.indicatorAccuracy}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WinRateChart weightHistory={learning?.weightHistory} />

          <div className="rounded-xl border border-zinc-800 bg-surface-200 p-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Recent Outcomes</h3>
            {learning?.history?.filter(s => s.outcome)?.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {learning.history
                  .filter(s => s.outcome)
                  .slice(-10)
                  .reverse()
                  .map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-300 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{s.coin}</span>
                        <span className={s.direction?.includes('LONG') ? 'text-long' : 'text-short'}>
                          {s.direction?.replace('STRONG_', '')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={
                          s.outcome === 'win' ? 'text-long' :
                            s.outcome === 'loss' ? 'text-short' : 'text-zinc-500'
                        }>
                          {s.outcome?.toUpperCase()}
                        </span>
                        {s.pnlPercent != null && (
                          <span className={`font-mono ${s.pnlPercent >= 0 ? 'text-long' : 'text-short'}`}>
                            {s.pnlPercent >= 0 ? '+' : ''}{s.pnlPercent.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-6">
                No resolved signals yet. Outcomes will appear as TP/SL levels are hit.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
