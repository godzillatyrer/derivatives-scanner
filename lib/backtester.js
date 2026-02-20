/**
 * Backtester engine.
 * Replays historical candles through the signal system to evaluate
 * indicator weights and thresholds before going live.
 *
 * Uses a sliding window approach: at each bar, feed the last N candles
 * into generateSignal() and simulate paper trades with TP/SL.
 */

import { generateSignal, calculateTPSL } from './signals.js';
import { DEFAULT_INDICATOR_WEIGHTS, TIMEFRAME_WEIGHTS } from './constants.js';

const WARMUP_BARS = 200; // need enough history for indicators (200 EMA, etc.)

/**
 * Run a single-timeframe backtest on one coin.
 *
 * @param {Object} opts
 * @param {Array}  opts.candles - Full historical candles [{time,open,high,low,close,volume}]
 * @param {string} opts.timeframe - e.g. '4h'
 * @param {Object} opts.weights - Indicator weights to test
 * @param {number} opts.minConfidence - Minimum confidence to enter a trade
 * @param {number} opts.atrMultiplierSL - ATR multiplier for stop loss
 * @param {number} opts.rrMultiplier - Risk/reward multiplier
 * @param {number} opts.maxHoldBars - Max bars to hold before forcing exit
 * @param {number} opts.leverage - Leverage for position sizing
 * @returns {Object} Backtest results
 */
export function runBacktest({
  candles,
  timeframe = '4h',
  weights = DEFAULT_INDICATOR_WEIGHTS,
  minConfidence = 40,
  atrMultiplierSL = 1.5,
  rrMultiplier = 1.5,
  maxHoldBars = 12, // 12 bars × 4h = 48h default
  leverage = 3,
}) {
  if (candles.length < WARMUP_BARS + 10) {
    return { error: 'Not enough candles', required: WARMUP_BARS + 10, got: candles.length };
  }

  const trades = [];
  let openTrade = null;
  const equityCurve = [];

  let balance = 10000;
  const startBalance = balance;
  let peakBalance = balance;
  let maxDrawdown = 0;

  // Walk through candles bar by bar after warmup
  for (let i = WARMUP_BARS; i < candles.length; i++) {
    const bar = candles[i];

    // Check open trade against current bar's high/low
    if (openTrade) {
      const isLong = openTrade.direction.includes('LONG');
      let closed = false;
      let exitPrice, reason;

      // Check stop loss hit (use bar low for long, bar high for short)
      if (isLong && bar.low <= openTrade.stopLoss) {
        exitPrice = openTrade.stopLoss;
        reason = 'stop_loss';
        closed = true;
      } else if (!isLong && bar.high >= openTrade.stopLoss) {
        exitPrice = openTrade.stopLoss;
        reason = 'stop_loss';
        closed = true;
      }

      // Check take profit hit
      if (!closed) {
        if (isLong && bar.high >= openTrade.takeProfit) {
          exitPrice = openTrade.takeProfit;
          reason = 'take_profit';
          closed = true;
        } else if (!isLong && bar.low <= openTrade.takeProfit) {
          exitPrice = openTrade.takeProfit;
          reason = 'take_profit';
          closed = true;
        }
      }

      // Check max hold time
      if (!closed && (i - openTrade.entryBar) >= maxHoldBars) {
        exitPrice = bar.close;
        reason = 'expired';
        closed = true;
      }

      if (closed) {
        const pnlPercent = isLong
          ? ((exitPrice - openTrade.entryPrice) / openTrade.entryPrice) * 100
          : ((openTrade.entryPrice - exitPrice) / openTrade.entryPrice) * 100;
        const pnlDollar = (pnlPercent / 100) * openTrade.size;

        balance += openTrade.margin + pnlDollar;

        trades.push({
          ...openTrade,
          exitPrice,
          exitBar: i,
          exitTime: bar.time,
          reason,
          pnlPercent,
          pnlDollar,
          outcome: pnlDollar >= 0 ? 'win' : 'loss',
          holdBars: i - openTrade.entryBar,
        });

        openTrade = null;
      }
    }

    // Try to open new trade if none open
    if (!openTrade) {
      const windowCandles = candles.slice(i - WARMUP_BARS, i + 1);
      const tfData = { [timeframe]: windowCandles };

      const signal = generateSignal(tfData, weights);
      if (signal && signal.direction !== 'NEUTRAL' && signal.confidence >= minConfidence) {
        const learningState = { atrMultiplierSL, rrMultiplier };
        const tpsl = calculateTPSL(signal, windowCandles, learningState);

        if (tpsl && tpsl.stopLoss) {
          const riskAmount = balance * 0.02;
          const slDistance = Math.abs(bar.close - tpsl.stopLoss);
          if (slDistance > 0) {
            const positionSize = (riskAmount / slDistance) * bar.close;
            const margin = positionSize / leverage;

            if (margin <= balance * 0.3) {
              openTrade = {
                direction: signal.direction,
                confidence: signal.confidence,
                entryPrice: bar.close,
                entryBar: i,
                entryTime: bar.time,
                stopLoss: tpsl.stopLoss,
                takeProfit: tpsl.takeProfits[0],
                size: positionSize,
                margin,
              };
              balance -= margin;
            }
          }
        }
      }
    }

    // Track equity
    let equity = balance;
    if (openTrade) {
      const isLong = openTrade.direction.includes('LONG');
      const unrealized = isLong
        ? ((bar.close - openTrade.entryPrice) / openTrade.entryPrice) * openTrade.size
        : ((openTrade.entryPrice - bar.close) / openTrade.entryPrice) * openTrade.size;
      equity += openTrade.margin + unrealized;
    }

    if (equity > peakBalance) peakBalance = equity;
    const dd = ((peakBalance - equity) / peakBalance) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;

    equityCurve.push({ bar: i, time: bar.time, equity, balance });
  }

  // Force close any open trade at end
  if (openTrade) {
    const lastBar = candles[candles.length - 1];
    const isLong = openTrade.direction.includes('LONG');
    const exitPrice = lastBar.close;
    const pnlPercent = isLong
      ? ((exitPrice - openTrade.entryPrice) / openTrade.entryPrice) * 100
      : ((openTrade.entryPrice - exitPrice) / openTrade.entryPrice) * 100;
    const pnlDollar = (pnlPercent / 100) * openTrade.size;
    balance += openTrade.margin + pnlDollar;

    trades.push({
      ...openTrade,
      exitPrice,
      exitBar: candles.length - 1,
      exitTime: lastBar.time,
      reason: 'backtest_end',
      pnlPercent,
      pnlDollar,
      outcome: pnlDollar >= 0 ? 'win' : 'loss',
      holdBars: candles.length - 1 - openTrade.entryBar,
    });
    openTrade = null;
  }

  // Compute stats
  const wins = trades.filter(t => t.outcome === 'win');
  const losses = trades.filter(t => t.outcome === 'loss');
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;

  const avgWin = wins.length > 0
    ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
  const avgLoss = losses.length > 0
    ? losses.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / losses.length : 0;

  const totalProfit = wins.reduce((s, t) => s + t.pnlDollar, 0);
  const totalLoss = losses.reduce((s, t) => s + Math.abs(t.pnlDollar), 0);
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  const finalEquity = balance;
  const returnPct = ((finalEquity - startBalance) / startBalance) * 100;

  // Sharpe-like ratio (simple version using trade returns)
  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdReturn > 0 ? avgReturn / stdReturn : 0;

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0, cw = 0, cl = 0;
  for (const t of trades) {
    if (t.outcome === 'win') { cw++; cl = 0; if (cw > maxConsecWins) maxConsecWins = cw; }
    else { cl++; cw = 0; if (cl > maxConsecLosses) maxConsecLosses = cl; }
  }

  // Sample equity curve (limit to ~200 points for UI)
  const step = Math.max(1, Math.floor(equityCurve.length / 200));
  const sampledEquity = equityCurve.filter((_, idx) => idx % step === 0);

  return {
    stats: {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      avgWinPct: avgWin,
      avgLossPct: avgLoss,
      profitFactor,
      sharpe,
      maxDrawdown,
      maxConsecWins,
      maxConsecLosses,
      returnPct,
      finalEquity,
      startBalance,
    },
    trades,
    equityCurve: sampledEquity,
    config: { minConfidence, atrMultiplierSL, rrMultiplier, maxHoldBars, leverage },
  };
}

/**
 * Grid search: test multiple parameter combinations and rank by Sharpe ratio.
 */
export function optimizeParameters({
  candles,
  timeframe = '4h',
  confidenceRange = [30, 40, 50, 60],
  atrSlRange = [1.0, 1.5, 2.0],
  rrRange = [1.0, 1.5, 2.0, 2.5],
  maxHoldBarsRange = [12],
}) {
  const results = [];

  for (const minConfidence of confidenceRange) {
    for (const atrMultiplierSL of atrSlRange) {
      for (const rrMultiplier of rrRange) {
        for (const maxHoldBars of maxHoldBarsRange) {
          const result = runBacktest({
            candles,
            timeframe,
            minConfidence,
            atrMultiplierSL,
            rrMultiplier,
            maxHoldBars,
          });

          if (result.error) continue;
          if (result.stats.totalTrades < 5) continue; // skip too few trades

          results.push({
            params: { minConfidence, atrMultiplierSL, rrMultiplier, maxHoldBars },
            ...result.stats,
          });
        }
      }
    }
  }

  // Rank by composite score: Sharpe × sqrt(trades) × profitFactor (balances quality and quantity)
  results.sort((a, b) => {
    const scoreA = a.sharpe * Math.sqrt(a.totalTrades) * Math.min(a.profitFactor, 5);
    const scoreB = b.sharpe * Math.sqrt(b.totalTrades) * Math.min(b.profitFactor, 5);
    return scoreB - scoreA;
  });

  return results.slice(0, 20); // top 20 configs
}
