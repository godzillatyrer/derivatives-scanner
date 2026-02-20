'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { TradingChart } from '@/components/charts/TradingChart';
import { IndicatorPanel } from '@/components/charts/IndicatorPanel';
import { SignalCard } from '@/components/signals/SignalCard';
import { Select } from '@/components/ui/Select';
import { LoadingScreen } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { usePrices } from '@/hooks/usePrices';
import { formatPrice } from '@/lib/utils';
import clsx from 'clsx';

export default function CoinDetailPage() {
  const params = useParams();
  const symbol = params.symbol;
  const { isConnected, lastUpdate, getPrice, getPriceData } = usePrices();

  const [interval, setInterval_] = useState('4h');
  const [candles, setCandles] = useState([]);
  const [indicators, setIndicators] = useState({});
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enabledIndicators, setEnabledIndicators] = useState({
    ema: true,
    bollingerBands: false,
    ichimoku: false,
    volume: true,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [candleRes, sigRes] = await Promise.all([
        fetch(`/api/candles?coin=${symbol}&interval=${interval}&count=300`),
        fetch(`/api/signals?coin=${symbol}`),
      ]);
      const candleData = await candleRes.json();
      const sigData = await sigRes.json();

      setCandles(candleData.candles || []);
      const sig = sigData.signals?.[0] || null;
      setSignal(sig);

      // Compute indicators client-side for chart overlays
      if (candleData.candles?.length > 0) {
        const { computeAllIndicators } = await import('@/lib/indicators');
        const ind = computeAllIndicators(candleData.candles);
        setIndicators(ind);
      }
    } catch (err) {
      console.error('Coin detail load error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const priceData = getPriceData(symbol);
  const livePrice = priceData?.price;

  return (
    <div>
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />

      <div className="p-6 space-y-6">
        {/* Coin header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-white">{symbol}</h2>
              <Badge variant="accent">PERP</Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-mono font-bold text-white">
                {formatPrice(livePrice || signal?.entry)}
              </span>
              {priceData?.change != null && priceData.change !== 0 && (
                <span className={clsx(
                  'text-sm font-mono',
                  priceData.change > 0 ? 'text-long' : 'text-short'
                )}>
                  {priceData.change > 0 ? '+' : ''}{priceData.change.toFixed(4)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select
              value={interval}
              onChange={setInterval_}
              options={[
                { value: '15m', label: '15 min' },
                { value: '1h', label: '1 hour' },
                { value: '4h', label: '4 hours' },
                { value: '1d', label: '1 day' },
              ]}
            />
            <button
              onClick={loadData}
              className="px-3 py-1.5 bg-surface-300 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingScreen text={`Loading ${symbol} data...`} />
        ) : (
          <>
            <IndicatorPanel
              enabled={enabledIndicators}
              onToggle={id =>
                setEnabledIndicators(prev => ({ ...prev, [id]: !prev[id] }))
              }
            />

            <TradingChart
              candles={candles}
              indicators={indicators}
              signal={signal}
              enabledIndicators={enabledIndicators}
              height={500}
            />

            {/* Indicator values summary */}
            {indicators.rsi && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <IndicatorValueCard
                  label="RSI (14)"
                  value={lastValid(indicators.rsi)?.toFixed(1)}
                  color={lastValid(indicators.rsi) > 70 ? 'text-short' : lastValid(indicators.rsi) < 30 ? 'text-long' : 'text-zinc-200'}
                />
                <IndicatorValueCard
                  label="MACD"
                  value={lastValid(indicators.macd?.histogram)?.toFixed(4)}
                  color={lastValid(indicators.macd?.histogram) > 0 ? 'text-long' : 'text-short'}
                />
                <IndicatorValueCard
                  label="ATR (14)"
                  value={lastValid(indicators.atr)?.toFixed(4)}
                />
                <IndicatorValueCard
                  label="ADX (14)"
                  value={lastValid(indicators.adx?.adx)?.toFixed(1)}
                  color={lastValid(indicators.adx?.adx) > 25 ? 'text-accent-light' : 'text-zinc-500'}
                />
                <IndicatorValueCard
                  label="Stoch RSI K"
                  value={lastValid(indicators.stochRsi?.k)?.toFixed(1)}
                  color={lastValid(indicators.stochRsi?.k) > 80 ? 'text-short' : lastValid(indicators.stochRsi?.k) < 20 ? 'text-long' : 'text-zinc-200'}
                />
                <IndicatorValueCard
                  label="VWAP"
                  value={formatPrice(lastValid(indicators.vwap))}
                />
              </div>
            )}

            {signal && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Current Signal</h3>
                <SignalCard signal={signal} showReasoning />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IndicatorValueCard({ label, value, color }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={clsx('text-sm font-mono font-medium', color || 'text-zinc-200')}>
        {value ?? '—'}
      </div>
    </Card>
  );
}

function lastValid(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
