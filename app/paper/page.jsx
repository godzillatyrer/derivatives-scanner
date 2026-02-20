'use client';
import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { LoadingScreen } from '@/components/ui/Spinner';
import { usePrices } from '@/hooks/usePrices';
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

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  const p = Number(price);
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  return p.toFixed(8);
}

export default function PaperTradingPage() {
  const { isConnected, prices, lastUpdate } = usePrices();
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [resetting, setResetting] = useState(false);

  const fetchPaper = useCallback(async () => {
    try {
      const res = await fetch('/api/paper');
      const data = await res.json();
      setPaper(data);
    } catch (err) {
      console.error('Paper fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPaper();
    const interval = setInterval(fetchPaper, 15000);
    return () => clearInterval(interval);
  }, [fetchPaper]);

  const handleReset = async () => {
    if (!confirm('Reset paper trading? This will clear all trades and reset balance to $10,000.')) return;
    setResetting(true);
    try {
      const res = await fetch('/api/paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', balance: 10000 }),
      });
      const data = await res.json();
      setPaper(data);
    } catch (err) {
      console.error('Reset error:', err);
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <LoadingScreen text="Loading paper trading..." />;

  const stats = paper?.stats || {};
  const totalReturn = paper ? ((paper.equity - paper.startingBalance) / paper.startingBalance) * 100 : 0;
  const isProfit = totalReturn >= 0;

  return (
    <div>
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Paper Trading</h2>
            <p className="text-sm text-zinc-500">
              Simulated trading with $10K starting balance — auto-executes signals
            </p>
          </div>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-4 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50"
          >
            {resetting ? 'Resetting...' : 'Reset Account'}
          </button>
        </div>

        {/* Account Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Equity"
            value={formatMoney(paper?.equity)}
            sub={formatPct(totalReturn)}
            color={isProfit ? 'text-long' : 'text-short'}
          />
          <StatCard
            label="Available Balance"
            value={formatMoney(paper?.balance)}
            sub={`of ${formatMoney(paper?.startingBalance)}`}
          />
          <StatCard
            label="Total P&L"
            value={formatMoney(stats.totalPnl)}
            color={stats.totalPnl >= 0 ? 'text-long' : 'text-short'}
            sub={`${stats.wins || 0}W / ${stats.losses || 0}L`}
          />
          <StatCard
            label="Win Rate"
            value={stats.winRate != null ? `${(stats.winRate * 100).toFixed(1)}%` : '—'}
            sub={`${stats.totalTrades || 0} total trades`}
            color={stats.winRate >= 0.5 ? 'text-long' : stats.winRate > 0 ? 'text-short' : 'text-zinc-400'}
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Best Trade"
            value={formatMoney(stats.bestTrade)}
            color="text-long"
          />
          <StatCard
            label="Worst Trade"
            value={formatMoney(stats.worstTrade)}
            color="text-short"
          />
          <StatCard
            label="Max Drawdown"
            value={`${(stats.maxDrawdown || 0).toFixed(2)}%`}
            color="text-short"
          />
          <StatCard
            label="Open Positions"
            value={`${paper?.openPositions?.length || 0} / 5`}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-200 rounded-lg p-1 w-fit">
          {['overview', 'open', 'history'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize',
                tab === t ? 'bg-accent text-white' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {t === 'open' ? `Open (${paper?.openPositions?.length || 0})` :
               t === 'history' ? `History (${paper?.closedTrades?.length || 0})` :
               'Overview'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && <OverviewTab paper={paper} />}
        {tab === 'open' && <OpenPositionsTab positions={paper?.openPositions || []} prices={prices} />}
        {tab === 'history' && <TradeHistoryTab trades={paper?.closedTrades || []} />}
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

function EquityCurve({ history, startingBalance }) {
  if (!history || history.length < 2) return null;

  const values = history.map(h => h.equity);
  const min = Math.min(...values, startingBalance * 0.9);
  const max = Math.max(...values, startingBalance * 1.1);
  const range = max - min || 1;

  const width = 600;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 25, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = history.map((h, i) => {
    const x = padding.left + (i / (history.length - 1)) * chartW;
    const y = padding.top + chartH - ((h.equity - min) / range) * chartH;
    return `${x},${y}`;
  });

  const polyline = points.join(' ');

  // Area fill (close the path to the bottom)
  const firstX = padding.left;
  const lastX = padding.left + chartW;
  const bottomY = padding.top + chartH;
  const areaPath = `M${firstX},${bottomY} L${points.map(p => `L${p}`).join(' ')} L${lastX},${bottomY} Z`;

  const currentEquity = values[values.length - 1];
  const isProfit = currentEquity >= startingBalance;

  // Starting balance line
  const baselineY = padding.top + chartH - ((startingBalance - min) / range) * chartH;

  // Time labels
  const firstTime = new Date(history[0].t);
  const lastTime = new Date(history[history.length - 1].t);
  const formatLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-surface-200 rounded-xl border border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-400">Equity Curve</h3>
        <span className={clsx('text-sm font-mono font-medium', isProfit ? 'text-long' : 'text-short')}>
          {formatMoney(currentEquity)}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        {/* Area fill */}
        <path
          d={areaPath}
          fill={isProfit ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)'}
        />
        {/* Starting balance reference line */}
        <line
          x1={padding.left} y1={baselineY}
          x2={padding.left + chartW} y2={baselineY}
          stroke="#3f3f46" strokeWidth="1" strokeDasharray="4,4"
        />
        {/* Equity line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={isProfit ? '#22c55e' : '#ef4444'}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Current value dot */}
        {points.length > 0 && (() => {
          const lastPoint = points[points.length - 1].split(',');
          return (
            <circle
              cx={lastPoint[0]} cy={lastPoint[1]}
              r="3"
              fill={isProfit ? '#22c55e' : '#ef4444'}
            />
          );
        })()}
        {/* Time labels */}
        <text x={padding.left} y={height - 4} fill="#71717a" fontSize="10" textAnchor="start">
          {formatLabel(firstTime)}
        </text>
        <text x={padding.left + chartW} y={height - 4} fill="#71717a" fontSize="10" textAnchor="end">
          {formatLabel(lastTime)}
        </text>
        {/* Baseline label */}
        <text x={padding.left + chartW - 2} y={baselineY - 4} fill="#71717a" fontSize="9" textAnchor="end">
          {formatMoney(startingBalance)}
        </text>
      </svg>
    </div>
  );
}

function OverviewTab({ paper }) {
  if (!paper) return null;
  const equity = paper.equity || paper.startingBalance;
  const startBal = paper.startingBalance || 10000;
  const barWidth = Math.min(100, Math.max(0, (equity / startBal) * 50));

  return (
    <div className="space-y-6">
      {/* Equity Curve */}
      {paper.equityHistory?.length > 1 && (
        <EquityCurve history={paper.equityHistory} startingBalance={startBal} />
      )}

      {/* Equity Bar */}
      <div className="bg-surface-200 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Equity Progress</h3>
        <div className="relative h-6 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              equity >= startBal ? 'bg-gradient-to-r from-long/80 to-long' : 'bg-gradient-to-r from-short/80 to-short'
            )}
            style={{ width: `${barWidth}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-white font-medium">
            {formatMoney(equity)} / {formatMoney(startBal * 2)}
          </div>
        </div>
        <div className="flex justify-between text-xs text-zinc-500 mt-2">
          <span>$0</span>
          <span>Starting: {formatMoney(startBal)}</span>
          <span>{formatMoney(startBal * 2)}</span>
        </div>
      </div>

      {/* Recent Trades */}
      {paper.closedTrades?.length > 0 && (
        <div className="bg-surface-200 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Recent Trades</h3>
          <div className="space-y-2">
            {paper.closedTrades.slice(-10).reverse().map(trade => (
              <div key={trade.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={clsx(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    trade.direction?.includes('LONG') ? 'bg-long/10 text-long' : 'bg-short/10 text-short'
                  )}>
                    {trade.direction?.includes('LONG') ? 'LONG' : 'SHORT'}
                  </span>
                  <span className="text-sm text-white font-medium">{trade.coin}</span>
                  <span className="text-xs text-zinc-500">{formatTime(trade.exitTime)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={clsx(
                    'text-xs px-2 py-0.5 rounded',
                    trade.reason === 'take_profit' ? 'bg-long/10 text-long' :
                    trade.reason === 'stop_loss' ? 'bg-short/10 text-short' : 'bg-zinc-800 text-zinc-400'
                  )}>
                    {trade.reason === 'take_profit' ? 'TP' : trade.reason === 'stop_loss' ? 'SL' : 'Expired'}
                  </span>
                  <span className={clsx(
                    'text-sm font-mono font-medium',
                    trade.pnlDollar >= 0 ? 'text-long' : 'text-short'
                  )}>
                    {formatMoney(trade.pnlDollar)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {paper.closedTrades?.length === 0 && paper.openPositions?.length === 0 && (
        <div className="bg-surface-200 rounded-xl border border-zinc-800 p-12 text-center">
          <p className="text-zinc-500 text-sm">No trades yet. The background worker will auto-execute signals.</p>
          <p className="text-zinc-600 text-xs mt-2">
            Run <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">node worker.mjs</code> to start the background engine.
          </p>
        </div>
      )}
    </div>
  );
}

function OpenPositionsTab({ positions, prices }) {
  if (positions.length === 0) {
    return (
      <div className="bg-surface-200 rounded-xl border border-zinc-800 p-12 text-center">
        <p className="text-zinc-500 text-sm">No open positions</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-surface-200">
            {['Coin', 'Direction', 'Entry', 'Current', 'Size', 'Margin', 'Unrealized P&L', 'SL', 'TP', 'Opened'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {positions.map(pos => {
            const currentPrice = prices[pos.coin]?.price || pos.entryPrice;
            const isLong = pos.direction?.includes('LONG');
            const pnlPct = isLong
              ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
              : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
            const pnlDollar = (pnlPct / 100) * pos.size;

            return (
              <tr key={pos.id} className="hover:bg-surface-300/50 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{pos.coin}</td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    isLong ? 'bg-long/10 text-long' : 'bg-short/10 text-short'
                  )}>
                    {isLong ? 'LONG' : 'SHORT'} {pos.leverage}x
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-zinc-300">{formatPrice(pos.entryPrice)}</td>
                <td className="px-4 py-3 font-mono text-zinc-300">{formatPrice(currentPrice)}</td>
                <td className="px-4 py-3 font-mono text-zinc-300">{formatMoney(pos.size)}</td>
                <td className="px-4 py-3 font-mono text-zinc-300">{formatMoney(pos.margin)}</td>
                <td className="px-4 py-3">
                  <div className={clsx('font-mono font-medium', pnlDollar >= 0 ? 'text-long' : 'text-short')}>
                    {formatMoney(pnlDollar)}
                    <span className="text-xs ml-1">({formatPct(pnlPct)})</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-short text-xs">{formatPrice(pos.stopLoss)}</td>
                <td className="px-4 py-3 font-mono text-long text-xs">{formatPrice(pos.takeProfit)}</td>
                <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatTime(pos.openTime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TradeHistoryTab({ trades }) {
  const reversed = [...trades].reverse();

  if (reversed.length === 0) {
    return (
      <div className="bg-surface-200 rounded-xl border border-zinc-800 p-12 text-center">
        <p className="text-zinc-500 text-sm">No trade history yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-surface-200">
            {['Coin', 'Direction', 'Entry', 'Exit', 'Size', 'P&L', 'P&L %', 'Result', 'Duration', 'Closed'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {reversed.map(trade => {
            const isLong = trade.direction?.includes('LONG');
            const duration = trade.exitTime && trade.openTime
              ? Math.round((trade.exitTime - trade.openTime) / 3600000) : 0;
            const durStr = duration < 1 ? '<1h' : duration < 24 ? `${duration}h` : `${Math.round(duration / 24)}d`;

            return (
              <tr key={trade.id} className="hover:bg-surface-300/50 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{trade.coin}</td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    isLong ? 'bg-long/10 text-long' : 'bg-short/10 text-short'
                  )}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-zinc-300 text-xs">{formatPrice(trade.entryPrice)}</td>
                <td className="px-4 py-3 font-mono text-zinc-300 text-xs">{formatPrice(trade.exitPrice)}</td>
                <td className="px-4 py-3 font-mono text-zinc-300 text-xs">{formatMoney(trade.size)}</td>
                <td className="px-4 py-3">
                  <span className={clsx('font-mono font-medium', trade.pnlDollar >= 0 ? 'text-long' : 'text-short')}>
                    {formatMoney(trade.pnlDollar)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={clsx('font-mono', trade.pnlPercent >= 0 ? 'text-long' : 'text-short')}>
                    {formatPct(trade.pnlPercent)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    trade.reason === 'take_profit' ? 'bg-long/10 text-long' :
                    trade.reason === 'stop_loss' ? 'bg-short/10 text-short' : 'bg-zinc-800 text-zinc-400'
                  )}>
                    {trade.reason === 'take_profit' ? 'TP Hit' : trade.reason === 'stop_loss' ? 'SL Hit' : 'Expired'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{durStr}</td>
                <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatTime(trade.exitTime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
