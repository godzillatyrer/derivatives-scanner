import { Card } from '@/components/ui/Card';
import clsx from 'clsx';

const INDICATOR_NAMES = {
  ema: 'EMA System',
  rsi: 'RSI',
  macd: 'MACD',
  stochRsi: 'Stochastic RSI',
  bollingerBands: 'Bollinger Bands',
  adx: 'ADX',
  ichimoku: 'Ichimoku Cloud',
  obv: 'OBV',
  vwap: 'VWAP',
  fibonacci: 'Fibonacci',
  volumeProfile: 'Volume Profile',
  atr: 'ATR',
};

export function IndicatorPerf({ weights, accuracy }) {
  if (!weights) return null;

  const entries = Object.entries(weights)
    .map(([name, weight]) => ({
      name: INDICATOR_NAMES[name] || name,
      weight,
      accuracy: accuracy?.[name] ?? null,
    }))
    .sort((a, b) => b.weight - a.weight);

  const maxWeight = Math.max(...entries.map(e => e.weight));

  return (
    <Card>
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Indicator Weights</h3>
      <div className="space-y-2">
        {entries.map(entry => (
          <div key={entry.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300">{entry.name}</span>
              <div className="flex items-center gap-3">
                {entry.accuracy != null && (
                  <span className={clsx(
                    'font-mono',
                    entry.accuracy > 0.55 ? 'text-long' : entry.accuracy < 0.45 ? 'text-short' : 'text-zinc-500'
                  )}>
                    {(entry.accuracy * 100).toFixed(0)}% acc
                  </span>
                )}
                <span className="font-mono text-zinc-400">
                  {(entry.weight * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-surface-300 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(entry.weight / maxWeight) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
