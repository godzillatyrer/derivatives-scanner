#!/usr/bin/env node
/**
 * Background worker for signal generation and paper trading.
 * Runs independently of the browser - keeps generating signals,
 * checking outcomes, and executing paper trades on a schedule.
 *
 * Uses the FULL 12-indicator signal library (same as the web app).
 *
 * Usage: node worker.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import the full signal generation library (all 12 indicators)
import { generateSignal, calculateTPSL } from './lib/signals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const STATE_FILE = join(DATA_DIR, 'learning-state.json');
const PAPER_FILE = join(DATA_DIR, 'paper-trading.json');
const CACHE_FILE = join(DATA_DIR, 'signal-cache.json');
const HEALTH_FILE = join(DATA_DIR, 'worker-health.json');

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

// ── Config ──
const SCAN_INTERVAL_MS = 2 * 60 * 1000;   // scan every 2 minutes
const OUTCOME_CHECK_MS = 30 * 1000;        // check outcomes every 30s
const TOP_COINS_COUNT = 50;                 // scan top 50 coins by volume
const BATCH_SIZE = 5;
const EQUITY_SNAPSHOT_INTERVAL = 5 * 60 * 1000; // snapshot equity every 5 min

const TIMEFRAMES = ['15m', '1h', '4h', '1d'];

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
    equityHistory: [],
    stats: {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      totalPnl: 0, maxDrawdown: 0, peakEquity: 10000,
      bestTrade: 0, worstTrade: 0,
    },
    lastUpdated: Date.now(),
  }));
}

// ── Worker Health ──
function writeHealth(status, extra = {}) {
  saveJSON(HEALTH_FILE, {
    status,
    pid: process.pid,
    uptime: process.uptime(),
    lastHeartbeat: Date.now(),
    ...extra,
  });
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
  if (paperState.openPositions.find(p => p.coin === signal.coin)) return;

  const riskAmount = paperState.balance * PAPER_CONFIG.riskPerTrade;
  const slDistance = Math.abs(price - signal.stopLoss);
  if (slDistance === 0) return;
  const positionSize = (riskAmount / slDistance) * price;
  const margin = positionSize / PAPER_CONFIG.leverage;

  if (margin > paperState.balance * 0.3) return;

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

    if (isLong && price <= pos.stopLoss) closeReason = 'stop_loss';
    else if (!isLong && price >= pos.stopLoss) closeReason = 'stop_loss';

    if (!closeReason) {
      if (isLong && price >= pos.takeProfit) closeReason = 'take_profit';
      else if (!isLong && price <= pos.takeProfit) closeReason = 'take_profit';
    }

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

  // Calculate equity
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

  if (paperState.equity > paperState.stats.peakEquity) {
    paperState.stats.peakEquity = paperState.equity;
  }
  const drawdown = ((paperState.stats.peakEquity - paperState.equity) / paperState.stats.peakEquity) * 100;
  if (drawdown > paperState.stats.maxDrawdown) {
    paperState.stats.maxDrawdown = drawdown;
  }

  if (paperState.closedTrades.length > 500) {
    paperState.closedTrades = paperState.closedTrades.slice(-500);
  }

  paperState.lastUpdated = Date.now();
  return toClose.length > 0;
}

function snapshotEquity(paperState) {
  if (!paperState.equityHistory) paperState.equityHistory = [];
  const last = paperState.equityHistory[paperState.equityHistory.length - 1];
  // Only snapshot if enough time has passed
  if (last && Date.now() - last.t < EQUITY_SNAPSHOT_INTERVAL) return;
  paperState.equityHistory.push({
    t: Date.now(),
    equity: paperState.equity,
    balance: paperState.balance,
    positions: paperState.openPositions.length,
  });
  // Keep last 2000 snapshots (~7 days at 5 min intervals)
  if (paperState.equityHistory.length > 2000) {
    paperState.equityHistory = paperState.equityHistory.slice(-2000);
  }
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
let scanCount = 0;

async function runSignalScan() {
  if (isScanning) return;
  isScanning = true;
  scanCount++;
  const start = Date.now();

  try {
    console.log(`[${new Date().toISOString()}] Scan #${scanCount} starting...`);
    const learningState = loadLearningState();
    const paperState = loadPaperState();

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

    checkOutcomes(learningState, currentPrices);
    checkPaperPositions(paperState, currentPrices);

    // Sort coins by volume, take top N
    const sortedCoins = Object.entries(coinData)
      .sort((a, b) => b[1].volume24h - a[1].volume24h)
      .slice(0, TOP_COINS_COUNT)
      .map(([name]) => name);

    // Generate signals using FULL 12-indicator library
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

          // Use the full generateSignal from lib/signals.js (all 12 indicators)
          const signal = generateSignal(tfData, learningState.weights);
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

    // Snapshot equity for chart
    snapshotEquity(paperState);

    // Save everything
    signals.sort((a, b) => b.confidence - a.confidence);
    saveJSON(CACHE_FILE, { signals, coinData, timestamp: Date.now() });
    saveJSON(PAPER_FILE, paperState);

    writeHealth('running', {
      lastScan: Date.now(),
      signalCount: signals.length,
      paperEquity: paperState.equity,
      openPositions: paperState.openPositions.length,
      scanNumber: scanCount,
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${new Date().toISOString()}] Scan #${scanCount} complete: ${signals.length} signals (12 indicators) in ${elapsed}s`);
    console.log(`  Paper: Balance=$${paperState.balance.toFixed(2)} Equity=$${paperState.equity.toFixed(2)} Open=${paperState.openPositions.length} Trades=${paperState.stats.totalTrades}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Scan error:`, err.message);
    writeHealth('error', { error: err.message, lastError: Date.now() });
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

    checkOutcomes(learningState, currentPrices);
    const paperChanged = checkPaperPositions(paperState, currentPrices);

    if (paperChanged) {
      snapshotEquity(paperState);
      saveJSON(PAPER_FILE, paperState);
      console.log(`[${new Date().toISOString()}] Paper positions updated - Balance: $${paperState.balance.toFixed(2)}`);
    }

    writeHealth('running', { lastHeartbeat: Date.now(), scanNumber: scanCount });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Outcome check error:`, err.message);
  }
}

// ── Start ──
console.log('=== HyperSignals Background Worker ===');
console.log('Signal engine: FULL 12-indicator suite (EMA, RSI, MACD, StochRSI, BB, ADX, Ichimoku, OBV, VWAP, Fib, VolProfile, ATR)');
console.log(`Scan interval: ${SCAN_INTERVAL_MS / 1000}s | Outcome check: ${OUTCOME_CHECK_MS / 1000}s`);
console.log(`Top coins: ${TOP_COINS_COUNT} | Paper starting balance: $10,000`);
console.log('');

writeHealth('starting');
runSignalScan();
setInterval(runSignalScan, SCAN_INTERVAL_MS);
setInterval(runOutcomeCheck, OUTCOME_CHECK_MS);
