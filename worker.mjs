#!/usr/bin/env node
/**
 * Background worker for signal generation and paper trading.
 * Runs independently of the browser - keeps generating signals,
 * checking outcomes, and executing paper trades on a schedule.
 *
 * Usage: node worker.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const STATE_FILE = join(DATA_DIR, 'learning-state.json');
const PAPER_FILE = join(DATA_DIR, 'paper-trading.json');
const CACHE_FILE = join(DATA_DIR, 'signal-cache.json');

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

// ── Config ──
const SCAN_INTERVAL_MS = 2 * 60 * 1000;   // scan every 2 minutes
const OUTCOME_CHECK_MS = 30 * 1000;        // check outcomes every 30s
const TOP_COINS_COUNT = 50;                 // scan top 50 coins by volume
const BATCH_SIZE = 5;

const TIMEFRAMES = ['15m', '1h', '4h', '1d'];
const TIMEFRAME_WEIGHTS = { '15m': 0.15, '1h': 0.25, '4h': 0.35, '1d': 0.25 };

// ── Helpers ──
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

async function post(body) {
  const res = await fetch(HYPERLIQUID_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function fetchMetaAndCtxs() {
  return post({ type: 'metaAndAssetCtxs' });
}

async function fetchAllMids() {
  return post({ type: 'allMids' });
}

async function fetchRecentCandles(coin, interval, count = 300) {
  const intervalMs = { '15m': 15*60*1000, '1h': 60*60*1000, '4h': 4*60*60*1000, '1d': 24*60*60*1000 };
  const ms = intervalMs[interval] || 60*60*1000;
  const startTime = Date.now() - ms * count;
  const data = await post({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime: Date.now() },
  });
  return data.map(c => ({
    time: c.t / 1000,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

// ── Indicators (inline for standalone worker) ──
function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  const ema = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const rsi = [];
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine.slice(26), 9);
  return { macdLine: macdLine.slice(26), signalLine };
}

function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function calcBollingerBands(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std, std };
}

function calcStochRSI(closes) {
  const rsi = calcRSI(closes, 14);
  if (rsi.length < 14) return null;
  const period = 14;
  const recent = rsi.slice(-period);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const k = max === min ? 50 : ((rsi[rsi.length - 1] - min) / (max - min)) * 100;
  return { k, d: k }; // simplified
}

// ── Signal Generation (simplified for worker) ──
function generateSignalFromCandles(tfData, weights) {
  const scores = {};
  let compositeScore = 0;
  let totalWeight = 0;

  for (const [tf, candles] of Object.entries(tfData)) {
    if (!candles || candles.length < 52) continue;
    const closes = candles.map(c => c.close);
    const price = closes[closes.length - 1];
    let tfScore = 0;
    let tfWeight = 0;

    // EMA
    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const ema50 = calcEMA(closes, 50);
    const e9 = ema9[ema9.length - 1], e21 = ema21[ema21.length - 1], e50 = ema50[ema50.length - 1];
    let emaScore = 0;
    if (e9 > e21 && e21 > e50) emaScore = 0.7;
    else if (e9 < e21 && e21 < e50) emaScore = -0.7;
    else if (price > e50) emaScore = 0.3;
    else if (price < e50) emaScore = -0.3;
    tfScore += emaScore * (weights.ema || 0.12);
    tfWeight += weights.ema || 0.12;

    // RSI
    const rsi = calcRSI(closes);
    if (rsi.length > 0) {
      const currentRSI = rsi[rsi.length - 1];
      let rsiScore = 0;
      if (currentRSI < 30) rsiScore = 0.7;
      else if (currentRSI < 40) rsiScore = 0.3;
      else if (currentRSI > 70) rsiScore = -0.7;
      else if (currentRSI > 60) rsiScore = -0.3;
      tfScore += rsiScore * (weights.rsi || 0.10);
      tfWeight += weights.rsi || 0.10;
    }

    // MACD
    const macd = calcMACD(closes);
    if (macd.signalLine.length > 0) {
      const macdVal = macd.macdLine[macd.macdLine.length - 1];
      const sigVal = macd.signalLine[macd.signalLine.length - 1];
      let macdScore = 0;
      if (macdVal > sigVal) macdScore = 0.5;
      else macdScore = -0.5;
      if (macdVal > 0) macdScore += 0.2;
      else macdScore -= 0.2;
      tfScore += Math.max(-1, Math.min(1, macdScore)) * (weights.macd || 0.12);
      tfWeight += weights.macd || 0.12;
    }

    // Bollinger Bands
    const bb = calcBollingerBands(closes);
    if (bb) {
      let bbScore = 0;
      if (price <= bb.lower) bbScore = 0.6;
      else if (price >= bb.upper) bbScore = -0.6;
      else if (price < bb.middle) bbScore = 0.2;
      else bbScore = -0.2;
      tfScore += bbScore * (weights.bollingerBands || 0.08);
      tfWeight += weights.bollingerBands || 0.08;
    }

    // Stoch RSI
    const stoch = calcStochRSI(closes);
    if (stoch) {
      let stochScore = 0;
      if (stoch.k < 20) stochScore = 0.6;
      else if (stoch.k > 80) stochScore = -0.6;
      tfScore += stochScore * (weights.stochRsi || 0.08);
      tfWeight += weights.stochRsi || 0.08;
    }

    const weight = TIMEFRAME_WEIGHTS[tf] || 0.25;
    scores[tf] = tfWeight > 0 ? tfScore / tfWeight : 0;
    compositeScore += scores[tf] * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  compositeScore /= totalWeight;

  let direction;
  if (compositeScore >= 0.4) direction = 'STRONG_LONG';
  else if (compositeScore >= 0.2) direction = 'LONG';
  else if (compositeScore <= -0.4) direction = 'STRONG_SHORT';
  else if (compositeScore <= -0.2) direction = 'SHORT';
  else direction = 'NEUTRAL';

  // Check multi-TF agreement
  const tfScores = Object.values(scores);
  const allAgree = tfScores.every(s => Math.sign(s) === Math.sign(compositeScore));
  let confidence = Math.abs(compositeScore) * 100;
  if (allAgree) confidence *= 1.2;
  else if (tfScores.some(s => Math.sign(s) !== Math.sign(compositeScore))) confidence *= 0.7;
  confidence = Math.min(99, Math.round(confidence));

  return { direction, score: compositeScore, confidence, timeframeScores: scores };
}

function calculateTPSL(signal, candles, learningState) {
  const price = candles[candles.length - 1].close;
  const atr = calcATR(candles);
  const mult = learningState?.atrMultiplierSL || 1.5;
  const rr = learningState?.rrMultiplier || 1.5;
  const isLong = signal.direction?.includes('LONG');
  const slDistance = atr * mult;
  const stopLoss = isLong ? price - slDistance : price + slDistance;
  const tp1 = isLong ? price + slDistance * rr : price - slDistance * rr;
  const tp2 = isLong ? price + slDistance * rr * 2 : price - slDistance * rr * 2;
  const tp3 = isLong ? price + slDistance * rr * 3 : price - slDistance * rr * 3;
  return { entry: price, stopLoss, takeProfits: [tp1, tp2, tp3] };
}

// ── State Management ──
function loadJSON(file, defaultVal) {
  ensureDataDir();
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return typeof defaultVal === 'function' ? defaultVal() : defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadLearningState() {
  return loadJSON(STATE_FILE, () => ({
    version: 1,
    weights: {
      ema: 0.12, rsi: 0.10, macd: 0.12, stochRsi: 0.08,
      bollingerBands: 0.08, adx: 0.08, ichimoku: 0.12,
      obv: 0.06, vwap: 0.08, fibonacci: 0.06, volumeProfile: 0.05, atr: 0.05,
    },
    history: [],
    stats: { totalSignals: 0, wins: 0, losses: 0, expired: 0, winRate: 0,
      avgProfit: 0, avgLoss: 0, profitFactor: 0, indicatorAccuracy: {}, coinPerformance: {} },
    atrMultiplierSL: 1.5, rrMultiplier: 1.5, lastOptimized: null, weightHistory: [],
  }));
}

function loadPaperState() {
  return loadJSON(PAPER_FILE, () => ({
    balance: 10000,
    startingBalance: 10000,
    equity: 10000,
    openPositions: [],
    closedTrades: [],
    stats: {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      totalPnl: 0, maxDrawdown: 0, peakEquity: 10000,
      bestTrade: 0, worstTrade: 0,
    },
    lastUpdated: Date.now(),
  }));
}

// ── Paper Trading Engine ──
const PAPER_CONFIG = {
  maxPositions: 5,
  riskPerTrade: 0.02,      // 2% of balance per trade
  minConfidence: 55,        // only trade signals with 55%+ confidence
  leverage: 3,              // 3x leverage
};

function openPaperTrade(paperState, signal, price) {
  if (paperState.openPositions.length >= PAPER_CONFIG.maxPositions) return;
  if (signal.confidence < PAPER_CONFIG.minConfidence) return;
  if (signal.direction === 'NEUTRAL') return;
  // Don't double up on same coin
  if (paperState.openPositions.find(p => p.coin === signal.coin)) return;

  const riskAmount = paperState.balance * PAPER_CONFIG.riskPerTrade;
  const slDistance = Math.abs(price - signal.stopLoss);
  if (slDistance === 0) return;
  const positionSize = (riskAmount / slDistance) * price;
  const margin = positionSize / PAPER_CONFIG.leverage;

  if (margin > paperState.balance * 0.3) return; // don't use more than 30% balance on one trade

  const trade = {
    id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    coin: signal.coin,
    direction: signal.direction,
    entryPrice: price,
    size: positionSize,
    margin,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfits[0],
    confidence: signal.confidence,
    openTime: Date.now(),
    leverage: PAPER_CONFIG.leverage,
  };

  paperState.openPositions.push(trade);
  paperState.balance -= margin;
  paperState.stats.totalTrades++;
  return trade;
}

function checkPaperPositions(paperState, currentPrices) {
  const toClose = [];

  for (const pos of paperState.openPositions) {
    const price = currentPrices[pos.coin];
    if (!price) continue;

    const isLong = pos.direction?.includes('LONG');
    let closeReason = null;

    // Check SL
    if (isLong && price <= pos.stopLoss) closeReason = 'stop_loss';
    else if (!isLong && price >= pos.stopLoss) closeReason = 'stop_loss';

    // Check TP
    if (!closeReason) {
      if (isLong && price >= pos.takeProfit) closeReason = 'take_profit';
      else if (!isLong && price <= pos.takeProfit) closeReason = 'take_profit';
    }

    // Expire after 48h
    if (!closeReason && Date.now() - pos.openTime > 48 * 60 * 60 * 1000) {
      closeReason = 'expired';
    }

    if (closeReason) {
      const exitPrice = closeReason === 'stop_loss' ? pos.stopLoss
        : closeReason === 'take_profit' ? pos.takeProfit : price;
      toClose.push({ pos, exitPrice, reason: closeReason });
    }
  }

  for (const { pos, exitPrice, reason } of toClose) {
    const isLong = pos.direction?.includes('LONG');
    const pnlPercent = isLong
      ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - exitPrice) / pos.entryPrice) * 100;
    const pnlDollar = (pnlPercent / 100) * pos.size;

    paperState.balance += pos.margin + pnlDollar;

    const closedTrade = {
      ...pos,
      exitPrice,
      exitTime: Date.now(),
      pnlPercent,
      pnlDollar,
      reason,
      outcome: pnlDollar >= 0 ? 'win' : 'loss',
    };
    paperState.closedTrades.push(closedTrade);
    paperState.openPositions = paperState.openPositions.filter(p => p.id !== pos.id);

    if (pnlDollar >= 0) paperState.stats.wins++;
    else paperState.stats.losses++;

    if (pnlDollar > paperState.stats.bestTrade) paperState.stats.bestTrade = pnlDollar;
    if (pnlDollar < paperState.stats.worstTrade) paperState.stats.worstTrade = pnlDollar;

    paperState.stats.totalPnl += pnlDollar;
    paperState.stats.winRate = paperState.stats.totalTrades > 0
      ? paperState.stats.wins / (paperState.stats.wins + paperState.stats.losses) : 0;
  }

  // Calculate equity (balance + unrealized PnL)
  let unrealized = 0;
  for (const pos of paperState.openPositions) {
    const price = currentPrices[pos.coin];
    if (!price) continue;
    const isLong = pos.direction?.includes('LONG');
    const pnl = isLong
      ? ((price - pos.entryPrice) / pos.entryPrice) * pos.size
      : ((pos.entryPrice - price) / pos.entryPrice) * pos.size;
    unrealized += pnl;
  }
  paperState.equity = paperState.balance + unrealized +
    paperState.openPositions.reduce((s, p) => s + p.margin, 0);

  // Track drawdown
  if (paperState.equity > paperState.stats.peakEquity) {
    paperState.stats.peakEquity = paperState.equity;
  }
  const drawdown = ((paperState.stats.peakEquity - paperState.equity) / paperState.stats.peakEquity) * 100;
  if (drawdown > paperState.stats.maxDrawdown) {
    paperState.stats.maxDrawdown = drawdown;
  }

  // Keep closed trades bounded (last 500)
  if (paperState.closedTrades.length > 500) {
    paperState.closedTrades = paperState.closedTrades.slice(-500);
  }

  paperState.lastUpdated = Date.now();
  return toClose.length > 0;
}

// ── Outcome Checking ──
function checkOutcomes(learningState, currentPrices) {
  let changed = false;
  for (const signal of learningState.history) {
    if (signal.outcome) continue;
    const price = currentPrices[signal.coin];
    if (!price) continue;
    const isLong = signal.direction?.includes('LONG');

    if (isLong && price <= signal.stopLoss) {
      signal.outcome = 'loss'; signal.exitPrice = signal.stopLoss;
      signal.exitTime = Date.now();
      signal.pnlPercent = ((signal.stopLoss - signal.entry) / signal.entry) * 100;
      changed = true;
    } else if (!isLong && price >= signal.stopLoss) {
      signal.outcome = 'loss'; signal.exitPrice = signal.stopLoss;
      signal.exitTime = Date.now();
      signal.pnlPercent = ((signal.entry - signal.stopLoss) / signal.entry) * 100;
      changed = true;
    }

    if (!signal.outcome && signal.takeProfits?.[0]) {
      const tp = signal.takeProfits[0];
      if (isLong && price >= tp) {
        signal.outcome = 'win'; signal.exitPrice = tp;
        signal.exitTime = Date.now();
        signal.pnlPercent = ((tp - signal.entry) / signal.entry) * 100;
        changed = true;
      } else if (!isLong && price <= tp) {
        signal.outcome = 'win'; signal.exitPrice = tp;
        signal.exitTime = Date.now();
        signal.pnlPercent = ((signal.entry - tp) / signal.entry) * 100;
        changed = true;
      }
    }

    if (!signal.outcome && Date.now() - signal.timestamp > 7 * 24 * 60 * 60 * 1000) {
      signal.outcome = 'expired'; signal.exitPrice = price;
      signal.exitTime = Date.now();
      signal.pnlPercent = isLong
        ? ((price - signal.entry) / signal.entry) * 100
        : ((signal.entry - price) / signal.entry) * 100;
      changed = true;
    }
  }
  if (changed) saveJSON(STATE_FILE, learningState);
  return changed;
}

// ── Main Loop ──
let isScanning = false;

async function runSignalScan() {
  if (isScanning) return;
  isScanning = true;
  const start = Date.now();

  try {
    console.log(`[${new Date().toISOString()}] Starting signal scan...`);
    const learningState = loadLearningState();
    const paperState = loadPaperState();

    // Fetch meta + asset contexts (includes volume, OI)
    const [metaCtxs, mids] = await Promise.all([fetchMetaAndCtxs(), fetchAllMids()]);
    const [meta, ctxs] = metaCtxs;

    const currentPrices = {};
    const coinData = {};
    for (let i = 0; i < meta.universe.length; i++) {
      const asset = meta.universe[i];
      const ctx = ctxs[i];
      const price = mids[asset.name] ? parseFloat(mids[asset.name]) : null;
      if (price) {
        currentPrices[asset.name] = price;
        coinData[asset.name] = {
          price,
          volume24h: parseFloat(ctx.dayNtlVlm || '0'),
          openInterest: parseFloat(ctx.openInterest || '0'),
          funding: parseFloat(ctx.funding || '0'),
          markPx: parseFloat(ctx.markPx || '0'),
          prevDayPx: parseFloat(ctx.prevDayPx || '0'),
        };
      }
    }

    // Check signal outcomes
    checkOutcomes(learningState, currentPrices);

    // Check paper positions
    const paperChanged = checkPaperPositions(paperState, currentPrices);

    // Sort coins by volume, take top N
    const sortedCoins = Object.entries(coinData)
      .sort((a, b) => b[1].volume24h - a[1].volume24h)
      .slice(0, TOP_COINS_COUNT)
      .map(([name]) => name);

    // Generate signals in batches
    const signals = [];
    for (let i = 0; i < sortedCoins.length; i += BATCH_SIZE) {
      const batch = sortedCoins.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (coin) => {
        try {
          const tfData = {};
          const candleResults = await Promise.all(
            TIMEFRAMES.map(async (tf) => {
              try {
                const candles = await fetchRecentCandles(coin, tf, 300);
                return { tf, candles };
              } catch { return { tf, candles: [] }; }
            })
          );
          for (const { tf, candles } of candleResults) {
            if (candles.length >= 52) tfData[tf] = candles;
          }
          if (Object.keys(tfData).length === 0) return null;

          const signal = generateSignalFromCandles(tfData, learningState.weights);
          if (!signal) return null;

          const tpslCandles = tfData['4h'] || tfData['1h'] || Object.values(tfData)[0];
          const tpsl = calculateTPSL(signal, tpslCandles, learningState);

          return {
            coin,
            price: currentPrices[coin],
            volume24h: coinData[coin]?.volume24h || 0,
            openInterest: coinData[coin]?.openInterest || 0,
            funding: coinData[coin]?.funding || 0,
            ...signal,
            ...tpsl,
          };
        } catch (err) {
          console.error(`  Error scanning ${coin}: ${err.message}`);
          return null;
        }
      }));
      signals.push(...results.filter(Boolean));
    }

    // Open paper trades on strong signals
    for (const sig of signals) {
      if (sig.direction !== 'NEUTRAL' && sig.confidence >= PAPER_CONFIG.minConfidence) {
        const opened = openPaperTrade(paperState, sig, sig.price);
        if (opened) {
          console.log(`  [PAPER] Opened ${opened.direction} on ${opened.coin} @ ${opened.entryPrice.toFixed(4)} (margin: $${opened.margin.toFixed(2)})`);
        }
      }
    }

    // Save everything
    signals.sort((a, b) => b.confidence - a.confidence);
    saveJSON(CACHE_FILE, {
      signals,
      coinData,
      timestamp: Date.now(),
    });
    saveJSON(PAPER_FILE, paperState);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${new Date().toISOString()}] Scan complete: ${signals.length} signals in ${elapsed}s`);
    console.log(`  Paper: Balance=$${paperState.balance.toFixed(2)} Equity=$${paperState.equity.toFixed(2)} Open=${paperState.openPositions.length} Trades=${paperState.stats.totalTrades}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Scan error:`, err.message);
  } finally {
    isScanning = false;
  }
}

async function runOutcomeCheck() {
  try {
    const learningState = loadLearningState();
    const paperState = loadPaperState();
    const mids = await fetchAllMids();
    const currentPrices = {};
    for (const [coin, price] of Object.entries(mids)) {
      currentPrices[coin] = parseFloat(price);
    }

    const outcomesChanged = checkOutcomes(learningState, currentPrices);
    const paperChanged = checkPaperPositions(paperState, currentPrices);

    if (paperChanged) {
      saveJSON(PAPER_FILE, paperState);
      console.log(`[${new Date().toISOString()}] Paper positions updated - Balance: $${paperState.balance.toFixed(2)}`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Outcome check error:`, err.message);
  }
}

// ── Start ──
console.log('=== HyperSignals Background Worker ===');
console.log(`Scan interval: ${SCAN_INTERVAL_MS / 1000}s | Outcome check: ${OUTCOME_CHECK_MS / 1000}s`);
console.log(`Top coins: ${TOP_COINS_COUNT} | Paper starting balance: $10,000`);
console.log('');

// Run immediately, then on intervals
runSignalScan();
setInterval(runSignalScan, SCAN_INTERVAL_MS);
setInterval(runOutcomeCheck, OUTCOME_CHECK_MS);
