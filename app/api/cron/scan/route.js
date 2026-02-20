/**
 * Cron-triggered signal scan.
 * Called by Vercel Cron every 2 minutes.
 *
 * Uses per-coin calibrated configs from the auto-calibration cron when
 * available, otherwise falls back to default thresholds.
 */

import { fetchMetaAndAssetCtxs, fetchAllMids, fetchRecentCandles } from '@/lib/hyperliquid';
import { generateSignal, calculateTPSL } from '@/lib/signals';
import { loadLearningState, checkSignalOutcomes, recordSignal } from '@/lib/learning';
import { loadState, saveState } from '@/lib/storage';
import { TIMEFRAMES } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAPER_KEY = 'paper-trading';
const CACHE_KEY = 'signal-cache';
const HEALTH_KEY = 'worker-health';
const CONFIGS_KEY = 'coin-configs';
const TOP_COINS = 50;
const BATCH_SIZE = 5;

const PAPER_DEFAULTS = {
  maxPositions: 5,
  riskPerTrade: 0.02,
  minConfidence: 40,
  leverage: 3,
  atrMultiplierSL: 1.5,
  rrMultiplier: 1.5,
};

const MIN_RECORD_CONFIDENCE = 35;

function defaultPaperState() {
  return {
    balance: 10000, startingBalance: 10000, equity: 10000,
    openPositions: [], closedTrades: [], equityHistory: [],
    stats: {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      totalPnl: 0, maxDrawdown: 0, peakEquity: 10000,
      bestTrade: 0, worstTrade: 0,
    },
    lastUpdated: Date.now(),
  };
}

function getCoinConfig(coinConfigs, coin) {
  const cc = coinConfigs?.[coin];
  if (cc && cc.calibratedAt) {
    return {
      minConfidence: cc.minConfidence ?? PAPER_DEFAULTS.minConfidence,
      atrMultiplierSL: cc.atrMultiplierSL ?? PAPER_DEFAULTS.atrMultiplierSL,
      rrMultiplier: cc.rrMultiplier ?? PAPER_DEFAULTS.rrMultiplier,
    };
  }
  return {
    minConfidence: PAPER_DEFAULTS.minConfidence,
    atrMultiplierSL: PAPER_DEFAULTS.atrMultiplierSL,
    rrMultiplier: PAPER_DEFAULTS.rrMultiplier,
  };
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
    if (!closeReason && Date.now() - pos.openTime > 48 * 60 * 60 * 1000) closeReason = 'expired';

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
    paperState.closedTrades.push({
      ...pos, exitPrice, exitTime: Date.now(), pnlPercent, pnlDollar, reason,
      outcome: pnlDollar >= 0 ? 'win' : 'loss',
    });
    paperState.openPositions = paperState.openPositions.filter(p => p.id !== pos.id);

    if (pnlDollar >= 0) paperState.stats.wins++;
    else paperState.stats.losses++;
    if (pnlDollar > paperState.stats.bestTrade) paperState.stats.bestTrade = pnlDollar;
    if (pnlDollar < paperState.stats.worstTrade) paperState.stats.worstTrade = pnlDollar;
    paperState.stats.totalPnl += pnlDollar;
    paperState.stats.winRate = (paperState.stats.wins + paperState.stats.losses) > 0
      ? paperState.stats.wins / (paperState.stats.wins + paperState.stats.losses) : 0;
  }

  let unrealized = 0;
  for (const pos of paperState.openPositions) {
    const price = currentPrices[pos.coin];
    if (!price) continue;
    const isLong = pos.direction?.includes('LONG');
    unrealized += isLong
      ? ((price - pos.entryPrice) / pos.entryPrice) * pos.size
      : ((pos.entryPrice - price) / pos.entryPrice) * pos.size;
  }
  paperState.equity = paperState.balance + unrealized +
    paperState.openPositions.reduce((s, p) => s + p.margin, 0);

  if (paperState.equity > paperState.stats.peakEquity) paperState.stats.peakEquity = paperState.equity;
  const dd = ((paperState.stats.peakEquity - paperState.equity) / paperState.stats.peakEquity) * 100;
  if (dd > paperState.stats.maxDrawdown) paperState.stats.maxDrawdown = dd;

  if (paperState.closedTrades.length > 500) paperState.closedTrades = paperState.closedTrades.slice(-500);

  if (!paperState.equityHistory) paperState.equityHistory = [];
  const lastSnap = paperState.equityHistory[paperState.equityHistory.length - 1];
  if (!lastSnap || Date.now() - lastSnap.t > 5 * 60 * 1000) {
    paperState.equityHistory.push({ t: Date.now(), equity: paperState.equity, balance: paperState.balance, positions: paperState.openPositions.length });
    if (paperState.equityHistory.length > 2000) paperState.equityHistory = paperState.equityHistory.slice(-2000);
  }

  paperState.lastUpdated = Date.now();
  return toClose.length > 0;
}

function openPaperTrade(paperState, signal, price, coinConfig) {
  if (paperState.openPositions.length >= PAPER_DEFAULTS.maxPositions) return;
  if (signal.confidence < coinConfig.minConfidence) return;
  if (signal.direction === 'NEUTRAL') return;
  if (paperState.openPositions.find(p => p.coin === signal.coin)) return;

  const riskAmount = paperState.balance * PAPER_DEFAULTS.riskPerTrade;
  const slDistance = Math.abs(price - signal.stopLoss);
  if (slDistance === 0) return;
  const positionSize = (riskAmount / slDistance) * price;
  const margin = positionSize / PAPER_DEFAULTS.leverage;
  if (margin > paperState.balance * 0.3) return;

  const trade = {
    id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    coin: signal.coin, direction: signal.direction, entryPrice: price,
    size: positionSize, margin, stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfits[0], confidence: signal.confidence,
    openTime: Date.now(), leverage: PAPER_DEFAULTS.leverage,
    calibrated: !!coinConfig.calibratedAt, // track if this used optimized params
  };

  paperState.openPositions.push(trade);
  paperState.balance -= margin;
  paperState.stats.totalTrades++;
  return trade;
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [learningState, paperState, coinConfigs] = await Promise.all([
      loadLearningState(),
      loadState(PAPER_KEY, defaultPaperState),
      loadState(CONFIGS_KEY, () => ({})),
    ]);

    // Fetch market data
    const [assets, mids] = await Promise.all([fetchMetaAndAssetCtxs(), fetchAllMids()]);
    const currentPrices = {};
    const coinData = {};
    for (const a of assets) {
      const price = mids[a.name] ? parseFloat(mids[a.name]) : null;
      if (price) {
        currentPrices[a.name] = price;
        coinData[a.name] = {
          price, volume24h: a.volume24h || 0, openInterest: a.openInterest || 0,
          funding: a.funding || 0, markPx: a.markPx || 0, prevDayPx: a.prevDayPx || 0,
        };
      }
    }

    // Check outcomes
    await checkSignalOutcomes(learningState, currentPrices);
    checkPaperPositions(paperState, currentPrices);

    // Sort by volume, take top N
    const sortedCoins = Object.entries(coinData)
      .sort((a, b) => b[1].volume24h - a[1].volume24h)
      .slice(0, TOP_COINS)
      .map(([name]) => name);

    // Generate signals
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

          const signal = generateSignal(tfData, learningState.weights);
          if (!signal) return null;

          // Use per-coin calibrated TP/SL params
          const cc = getCoinConfig(coinConfigs, coin);
          const tpslCandles = tfData['4h'] || tfData['1h'] || Object.values(tfData)[0];
          const tpsl = calculateTPSL(signal, tpslCandles, {
            ...learningState,
            atrMultiplierSL: cc.atrMultiplierSL,
            rrMultiplier: cc.rrMultiplier,
          });

          if (signal.direction !== 'NEUTRAL' && signal.confidence >= MIN_RECORD_CONFIDENCE) {
            await recordSignal({
              coin, direction: signal.direction, confidence: signal.confidence,
              entry: tpsl?.entry, stopLoss: tpsl?.stopLoss, takeProfits: tpsl?.takeProfits,
              indicatorScores: signal.timeframeResults?.['4h']?.indicators || {},
            });
          }

          return {
            coin, price: currentPrices[coin],
            volume24h: coinData[coin]?.volume24h || 0,
            openInterest: coinData[coin]?.openInterest || 0,
            funding: coinData[coin]?.funding || 0,
            calibrated: !!coinConfigs?.[coin]?.calibratedAt,
            ...signal, ...tpsl,
          };
        } catch (err) {
          console.error(`Error scanning ${coin}:`, err.message);
          return null;
        }
      }));
      signals.push(...results.filter(Boolean));
    }

    // Open paper trades using per-coin configs
    let tradesOpened = 0;
    for (const sig of signals) {
      if (sig.direction !== 'NEUTRAL') {
        const cc = getCoinConfig(coinConfigs, sig.coin);
        if (sig.confidence >= cc.minConfidence) {
          if (openPaperTrade(paperState, sig, sig.price, cc)) tradesOpened++;
        }
      }
    }

    // Save everything
    signals.sort((a, b) => b.confidence - a.confidence);
    const calibratedCount = Object.keys(coinConfigs).length;
    await Promise.all([
      saveState(CACHE_KEY, { signals, coinData, timestamp: Date.now() }),
      saveState(PAPER_KEY, paperState),
      saveState(HEALTH_KEY, {
        status: 'running', lastHeartbeat: Date.now(), lastScan: Date.now(),
        signalCount: signals.length, paperEquity: paperState.equity,
        openPositions: paperState.openPositions.length, isOnline: true,
        calibratedCoins: calibratedCount,
      }),
    ]);

    return Response.json({
      ok: true,
      signals: signals.length,
      tradesOpened,
      paperEquity: paperState.equity,
      openPositions: paperState.openPositions.length,
      calibratedCoins: calibratedCount,
    });
  } catch (err) {
    console.error('Cron scan error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
