'use client';
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { CoinTable } from '@/components/coins/CoinTable';
import { LoadingScreen } from '@/components/ui/Spinner';
import { usePrices } from '@/hooks/usePrices';

export default function CoinsPage() {
  const { isConnected, prices, lastUpdate } = usePrices();
  const [coins, setCoins] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [metaRes, sigRes] = await Promise.all([
          fetch('/api/meta'),
          fetch('/api/signals?limit=50'),
        ]);
        const metaData = await metaRes.json();
        const sigData = await sigRes.json();
        setCoins(metaData.coins || []);
        setSignals(sigData.signals || []);
      } catch (err) {
        console.error('Coins page load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <LoadingScreen text="Loading coins..." />;

  return (
    <div>
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />

      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">All Coins</h2>
          <p className="text-sm text-zinc-500">
            {coins.length} perpetual contracts on Hyperliquid with real-time prices
          </p>
        </div>

        <CoinTable coins={coins} prices={prices} signals={signals} />
      </div>
    </div>
  );
}
