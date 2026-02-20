'use client';
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import clsx from 'clsx';

function formatMoney(n) {
  if (n == null || isNaN(n)) return '$0.00';
  return n < 0
    ? `-$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(n) {
  if (n == null || isNaN(n)) return '0.00%';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

const POPULAR_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'WIF', 'PEPE', 'ARB', 'OP', 'AVAX', 'LINK', 'SUI', 'SEI'];

export default function BacktestPage() {
  const [coin, setCoin] = useState('BTC');
  const [timeframe, setTimeframe] = useState('4h');
  const [days, setDays] = useState(60);
  const [minConfidence, setMinConfidence] = useState(40);
  const [atrSL, setAtrSL] = useState(1.5);
  const [rrMultiplier, setRrMultiplier] = useState(1.5);
  const [mode, setMode] = useState('single');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [calLoading, setCalLoading] = useState(false);

  useEffect(() => {
    fetch('/api/calibration').then(r => r.json()).then(setCalibration).catch(() => {});
  }, []);

  const maxHoldBars = Math.round((48 * 60 * 60 * 1000) / ({
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  }[timeframe] || 4 * 60 * 60 * 1000));

  async function runBacktest() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coin, timeframe, days, mode,
          minConfidence, atrMultiplierSL: atrSL, rrMultiplier,
          maxHoldBars,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Header />

      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Backtester</h2>
          <p className="text-sm text-zinc-500">
            Test indicator weights and thresholds against historical data
          </p>
        </div>

        {/* Config Panel */}
        <div className="bg-surface-200 rounded-xl border border-zinc-800 p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {/* Coin */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Coin</label>
              <input
                type="text"
                value={coin}
                onChange={e => setCoin(e.target.value.toUpperCase())}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {POPULAR_COINS.slice(0, 6).map(c => (
                  <button
                    key={c}
                    onClick={() => setCoin(c)}
                    className={clsx(
                      'px-2 py-0.5 rounded text-xs transition-colors',
                      coin === c ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Timeframe</label>
              <div className="flex gap-1">
                {['15m', '1h', '4h', '1d'].map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={clsx(
                      'flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                      timeframe === tf ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Days */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">History (days)</label>
              <div className="flex gap-1">
                {[30, 60, 90, 180].map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={clsx(
                      'flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                      days === d ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Mode</label>
              <div className="flex gap-1">
                {[
                  { id: 'single', label: 'Single Run' },
                  { id: 'optimize', label: 'Optimize' },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={clsx(
                      'flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                      mode === m.id ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Parameter Sliders (single mode only) */}
          {mode === 'single' && (
            <div className="grid grid-cols-3 gap-4 mb-4 pt-4 border-t border-zinc-800">
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
                  Min Confidence: <span className="text-white">{minConfidence}</span>
                </label>
                <input
                  type="range" min={20} max={80} step={5}
                  value={minConfidence}
                  onChange={e => setMinConfidence(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
                  ATR SL Multiplier: <span className="text-white">{atrSL}x</span>
                </label>
                <input
                  type="range" min={0.5} max={3} step={0.25}
                  value={atrSL}
                  onChange={e => setAtrSL(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
                  R:R Multiplier: <span className="text-white">{rrMultiplier}x</span>
                </label>
                <input
                  type="range" min={0.5} max={4} step={0.25}
                  value={rrMultiplier}
                  onChange={e => setRrMultiplier(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}

          <button
            onClick={runBacktest}
            disabled={loading}
            className={clsx(
              'w-full py-3 rounded-lg text-sm font-semibold transition-all',
              loading
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-accent to-long text-white hover:opacity-90'
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                {mode === 'optimize' ? 'Running grid search...' : 'Running backtest...'}
              </span>
            ) : (
              mode === 'optimize' ? 'Run Optimization (36 combinations)' : 'Run Backtest'
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-short/10 border border-short/30 rounded-xl p-4 text-sm text-short">
            {error}
          </div>
        )}

        {/* Results */}
        {result && result.mode === 'single' && <SingleResult data={result} />}
        {result && result.mode === 'optimize' && <OptimizeResult data={result} />}

        {/* Auto-Calibration Section */}
        <CalibrationPanel
          calibration={calibration}
          loading={calLoading}
          onRunCalibration={async () => {
            setCalLoading(true);
            try {
              await fetch('/api/cron/calibrate');
              const res = await fetch('/api/calibration');
              setCalibration(await res.json());
            } catch (err) {
              console.error('Calibration error:', err);
            } finally {
              setCalLoading(false);
            }
          }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-surface-200 rounded-xl border border-zinc-800 p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={clsx('text-lg font-bold font-mono', color || 'text-white')}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function SingleResult({ data }) {
  const { stats, equityCurve, trades, config } = data;
  const isProfit = stats.returnPct >= 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Return"
          value={formatPct(stats.returnPct)}
          sub={`${formatMoney(stats.startBalance)} -> ${formatMoney(stats.finalEquity)}`}
          color={isProfit ? 'text-long' : 'text-short'}
        />
        <StatCard
          label="Win Rate"
          value={`${(stats.winRate * 100).toFixed(1)}%`}
          sub={`${stats.wins}W / ${stats.losses}L of ${stats.totalTrades} trades`}
          color={stats.winRate >= 0.5 ? 'text-long' : 'text-short'}
        />
        <StatCard
          label="Profit Factor"
          value={stats.profitFactor === Infinity ? 'INF' : stats.profitFactor.toFixed(2)}
          sub={`Avg win: ${formatPct(stats.avgWinPct)} | Avg loss: -${formatPct(stats.avgLossPct)}`}
          color={stats.profitFactor >= 1.5 ? 'text-long' : stats.profitFactor >= 1 ? 'text-yellow-400' : 'text-short'}
        />
        <StatCard
          label="Max Drawdown"
          value={`${stats.maxDrawdown.toFixed(2)}%`}
          sub={`Sharpe: ${stats.sharpe.toFixed(2)} | Consec W/L: ${stats.maxConsecWins}/${stats.maxConsecLosses}`}
          color="text-short"
        />
      </div>

      {/* Equity Curve */}
      {equityCurve?.length > 1 && <BacktestEquityCurve data={equityCurve} startBalance={stats.startBalance} />}

      {/* Trade List */}
      {trades?.length > 0 && (
        <div className="bg-surface-200 rounded-xl border border-zinc-800">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-400">Trade Log ({trades.length} trades)</h3>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-200">
                <tr className="border-b border-zinc-800">
                  {['#', 'Direction', 'Conf', 'Entry', 'Exit', 'P&L %', 'P&L $', 'Result', 'Bars'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {trades.map((t, idx) => (
                  <tr key={idx} className="hover:bg-surface-300/50">
                    <td className="px-3 py-2 text-zinc-500 text-xs">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        t.direction?.includes('LONG') ? 'bg-long/10 text-long' : 'bg-short/10 text-short'
                      )}>
                        {t.direction?.includes('LONG') ? 'LONG' : 'SHORT'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{t.confidence}</td>
                    <td className="px-3 py-2 font-mono text-zinc-300 text-xs">{t.entryPrice?.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-zinc-300 text-xs">{t.exitPrice?.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <span className={clsx('font-mono text-xs', t.pnlPercent >= 0 ? 'text-long' : 'text-short')}>
                        {formatPct(t.pnlPercent)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={clsx('font-mono text-xs', t.pnlDollar >= 0 ? 'text-long' : 'text-short')}>
                        {formatMoney(t.pnlDollar)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded text-xs',
                        t.reason === 'take_profit' ? 'bg-long/10 text-long' :
                        t.reason === 'stop_loss' ? 'bg-short/10 text-short' : 'bg-zinc-800 text-zinc-400'
                      )}>
                        {t.reason === 'take_profit' ? 'TP' : t.reason === 'stop_loss' ? 'SL' : 'Exp'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-500 text-xs">{t.holdBars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OptimizeResult({ data }) {
  const { results, coin, timeframe, days } = data;

  if (!results || results.length === 0) {
    return (
      <div className="bg-surface-200 rounded-xl border border-zinc-800 p-12 text-center">
        <p className="text-zinc-500 text-sm">No valid configurations found. Try more history or different parameters.</p>
      </div>
    );
  }

  const best = results[0];

  return (
    <div className="space-y-6">
      {/* Best Config Highlight */}
      <div className="bg-accent/5 border border-accent/30 rounded-xl p-6">
        <h3 className="text-sm font-medium text-accent-light mb-3">Best Configuration for {coin} ({timeframe}, {days}d)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Min Confidence</div>
            <div className="text-lg font-bold font-mono text-white">{best.params.minConfidence}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">ATR SL Mult.</div>
            <div className="text-lg font-bold font-mono text-white">{best.params.atrMultiplierSL}x</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">R:R Multiplier</div>
            <div className="text-lg font-bold font-mono text-white">{best.params.rrMultiplier}x</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Performance</div>
            <div className={clsx('text-lg font-bold font-mono', best.returnPct >= 0 ? 'text-long' : 'text-short')}>
              {formatPct(best.returnPct)}
            </div>
          </div>
        </div>
        <div className="flex gap-6 mt-3 pt-3 border-t border-accent/20 text-sm">
          <span className="text-zinc-400">Win Rate: <span className="text-white font-mono">{(best.winRate * 100).toFixed(1)}%</span></span>
          <span className="text-zinc-400">Trades: <span className="text-white font-mono">{best.totalTrades}</span></span>
          <span className="text-zinc-400">PF: <span className="text-white font-mono">{best.profitFactor === Infinity ? 'INF' : best.profitFactor.toFixed(2)}</span></span>
          <span className="text-zinc-400">Max DD: <span className="text-short font-mono">{best.maxDrawdown.toFixed(2)}%</span></span>
          <span className="text-zinc-400">Sharpe: <span className="text-white font-mono">{best.sharpe.toFixed(2)}</span></span>
        </div>
      </div>

      {/* All Results Table */}
      <div className="bg-surface-200 rounded-xl border border-zinc-800">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-400">Top {results.length} Configurations (ranked by composite score)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Rank', 'Confidence', 'ATR SL', 'R:R', 'Trades', 'Win Rate', 'Return', 'PF', 'Sharpe', 'Max DD'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {results.map((r, idx) => (
                <tr key={idx} className={clsx('hover:bg-surface-300/50', idx === 0 && 'bg-accent/5')}>
                  <td className="px-3 py-2 text-zinc-400 text-xs">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono text-white">{r.params.minConfidence}</td>
                  <td className="px-3 py-2 font-mono text-white">{r.params.atrMultiplierSL}x</td>
                  <td className="px-3 py-2 font-mono text-white">{r.params.rrMultiplier}x</td>
                  <td className="px-3 py-2 font-mono text-zinc-300">{r.totalTrades}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('font-mono', r.winRate >= 0.5 ? 'text-long' : 'text-short')}>
                      {(r.winRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={clsx('font-mono font-medium', r.returnPct >= 0 ? 'text-long' : 'text-short')}>
                      {formatPct(r.returnPct)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-300">
                    {r.profitFactor === Infinity ? 'INF' : r.profitFactor.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-300">{r.sharpe.toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-short">{r.maxDrawdown.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BacktestEquityCurve({ data, startBalance }) {
  const values = data.map(d => d.equity);
  const min = Math.min(...values, startBalance * 0.9);
  const max = Math.max(...values, startBalance * 1.1);
  const range = max - min || 1;

  const width = 800;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 25, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - ((d.equity - min) / range) * chartH;
    return `${x},${y}`;
  });

  const polyline = points.join(' ');
  const firstX = padding.left;
  const lastX = padding.left + chartW;
  const bottomY = padding.top + chartH;
  const areaPath = `M${firstX},${bottomY} ${points.map(p => `L${p}`).join(' ')} L${lastX},${bottomY} Z`;

  const finalEquity = values[values.length - 1];
  const isProfit = finalEquity >= startBalance;
  const baselineY = padding.top + chartH - ((startBalance - min) / range) * chartH;

  return (
    <div className="bg-surface-200 rounded-xl border border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-400">Equity Curve</h3>
        <span className={clsx('text-sm font-mono font-medium', isProfit ? 'text-long' : 'text-short')}>
          {formatMoney(finalEquity)}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <path
          d={areaPath}
          fill={isProfit ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)'}
        />
        <line
          x1={padding.left} y1={baselineY}
          x2={padding.left + chartW} y2={baselineY}
          stroke="#3f3f46" strokeWidth="1" strokeDasharray="4,4"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke={isProfit ? '#22c55e' : '#ef4444'}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <text x={padding.left + chartW - 2} y={baselineY - 4} fill="#71717a" fontSize="9" textAnchor="end">
          {formatMoney(startBalance)}
        </text>
      </svg>
    </div>
  );
}

function CalibrationPanel({ calibration, loading, onRunCalibration }) {
  const configs = calibration?.configs || [];
  const lastRun = calibration?.lastRun;
  const lastRunAgo = lastRun ? formatTimeAgo(lastRun) : 'Never';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Auto-Calibration</h3>
          <p className="text-sm text-zinc-500">
            Runs every 6h — backtests top 20 coins and optimizes per-coin trading parameters automatically
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Last run: {lastRunAgo}</span>
          <button
            onClick={onRunCalibration}
            disabled={loading}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              loading
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : 'bg-accent text-white hover:opacity-90'
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                Calibrating...
              </span>
            ) : 'Run Now'}
          </button>
        </div>
      </div>

      {configs.length > 0 ? (
        <div className="bg-surface-200 rounded-xl border border-zinc-800">
          <div className="p-4 border-b border-zinc-800">
            <h4 className="text-sm font-medium text-zinc-400">
              {configs.length} coins calibrated — scanner uses these configs for paper trading
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Coin', 'Min Conf', 'ATR SL', 'R:R', 'BT Win Rate', 'BT Return', 'BT PF', 'BT Sharpe', 'Trades', 'Calibrated'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {configs.map(c => (
                  <tr key={c.coin} className="hover:bg-surface-300/50">
                    <td className="px-3 py-2 font-medium text-white">{c.coin}</td>
                    <td className="px-3 py-2 font-mono text-zinc-300">{c.minConfidence}</td>
                    <td className="px-3 py-2 font-mono text-zinc-300">{c.atrMultiplierSL}x</td>
                    <td className="px-3 py-2 font-mono text-zinc-300">{c.rrMultiplier}x</td>
                    <td className="px-3 py-2">
                      <span className={clsx('font-mono', (c.winRate || 0) >= 0.5 ? 'text-long' : 'text-short')}>
                        {c.winRate != null ? `${(c.winRate * 100).toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={clsx('font-mono font-medium', (c.returnPct || 0) >= 0 ? 'text-long' : 'text-short')}>
                        {c.returnPct != null ? formatPct(c.returnPct) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-300">
                      {c.profitFactor != null ? (c.profitFactor === Infinity ? 'INF' : c.profitFactor.toFixed(2)) : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-300">
                      {c.sharpe != null ? c.sharpe.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-400">{c.totalTrades || '—'}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500">{c.calibratedAt ? formatTimeAgo(c.calibratedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-surface-200 rounded-xl border border-zinc-800 p-12 text-center">
          <p className="text-zinc-500 text-sm">No calibration data yet. Click "Run Now" to calibrate top coins.</p>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
