'use client';
import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { CoinTable } from '@/components/coins/CoinTable';
import { LoadingScreen } from '@/components/ui/Spinner';
import { usePrices } from '@/hooks/usePrices';

export default function CoinsPage() {
  const { isConnected, prices, lastUpdate } = usePrices();
  const [coins, setCoins] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    try {
      // Fetch meta (has volume, OI, market cap) and try cached signals first
      const [metaRes, cacheRes] = await Promise.all([
        fetch('/api/meta'),
        fetch('/api/cache'),
      ]);
      const metaData = await metaRes.json();
      const cacheData = await cacheRes.json();

      setCoins(metaData.coins || []);

      // Use cached signals if available and recent (< 5 min old)
      if (cacheData.signals?.length > 0 && cacheData.timestamp &&
          Date.now() - cacheData.timestamp < 5 * 60 * 1000) {
        setSignals(cacheData.signals);
      } else {
        // Fall back to generating fresh signals
        const sigRes = await fetch('/api/signals?limit=50');
        const sigData = await sigRes.json();
        setSignals(sigData.signals || []);
      }

      setLastRefresh(Date.now());
    } catch (err) {
      console.error('Coins page load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 30 seconds
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <LoadingScreen text="Loading coins..." />;

  return (
    <div>
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">All Coins</h2>
            <p className="text-sm text-zinc-500">
              {coins.length} perpetual contracts — sorted by 24h volume
              {lastRefresh && (
                <span className="ml-2 text-zinc-600">
                  (auto-refreshes every 30s)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg text-xs bg-surface-300 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-colors"
          >
            Refresh
          </button>
        </div>

        <CoinTable coins={coins} prices={prices} signals={signals} />
      </div>
    </div>
  );
}
