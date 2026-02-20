/**
 * Cron-triggered outcome check.
 * Checks if any signal TP/SL levels have been hit and updates paper positions.
 * Called by Vercel Cron every 1 minute.
 */

import { fetchAllMids } from '@/lib/hyperliquid';
import { loadLearningState, checkSignalOutcomes } from '@/lib/learning';
import { loadState, saveState } from '@/lib/storage';
import { PAPER_TRADING_FEES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const PAPER_KEY = 'paper-trading';
const HEALTH_KEY = 'worker-health';

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

  for (const { pos, exitPrice: rawExitPrice, reason } of toClose) {
    const isLong = pos.direction?.includes('LONG');
    // Apply slippage
    const slippageAdj = rawExitPrice * PAPER_TRADING_FEES.slippagePct;
    const exitPrice = isLong ? rawExitPrice - slippageAdj : rawExitPrice + slippageAdj;
    // Apply taker fee on entry + exit
    const feeCost = (pos.size * PAPER_TRADING_FEES.takerFee) * 2;

    const rawPnlPercent = isLong
      ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - exitPrice) / pos.entryPrice) * 100;
    const rawPnlDollar = (rawPnlPercent / 100) * pos.size;
    const pnlDollar = rawPnlDollar - feeCost;
    const pnlPercent = (pnlDollar / pos.size) * 100;

    paperState.balance += pos.margin + pnlDollar;
    paperState.closedTrades.push({
      ...pos, exitPrice, exitTime: Date.now(), pnlPercent, pnlDollar, reason,
      fees: feeCost, slippage: slippageAdj,
      outcome: pnlDollar >= 0 ? 'win' : 'loss',
    });
    paperState.openPositions = paperState.openPositions.filter(p => p.id !== pos.id);

    // Track cooldown
    if (!paperState.cooldowns) paperState.cooldowns = {};
    paperState.cooldowns[pos.coin] = Date.now();

    if (pnlDollar >= 0) paperState.stats.wins++;
    else paperState.stats.losses++;
    if (pnlDollar > paperState.stats.bestTrade) paperState.stats.bestTrade = pnlDollar;
    if (pnlDollar < paperState.stats.worstTrade) paperState.stats.worstTrade = pnlDollar;
    paperState.stats.totalPnl += pnlDollar;
    paperState.stats.winRate = (paperState.stats.wins + paperState.stats.losses) > 0
      ? paperState.stats.wins / (paperState.stats.wins + paperState.stats.losses) : 0;
  }

  // Equity
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

  // Equity snapshot every run (check cron runs every 1 min — more granular than scan's 5 min)
  if (!paperState.equityHistory) paperState.equityHistory = [];
  const lastSnap = paperState.equityHistory[paperState.equityHistory.length - 1];
  if (!lastSnap || Date.now() - lastSnap.t > 60 * 1000) {
    paperState.equityHistory.push({
      t: Date.now(), equity: paperState.equity,
      balance: paperState.balance, positions: paperState.openPositions.length,
    });
    if (paperState.equityHistory.length > 2000) paperState.equityHistory = paperState.equityHistory.slice(-2000);
  }

  paperState.lastUpdated = Date.now();
  return toClose.length > 0;
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const learningState = await loadLearningState();
    const paperState = await loadState(PAPER_KEY, defaultPaperState);

    const mids = await fetchAllMids();
    const currentPrices = {};
    for (const [coin, price] of Object.entries(mids)) {
      currentPrices[coin] = parseFloat(price);
    }

    await checkSignalOutcomes(learningState, currentPrices);
    const paperChanged = checkPaperPositions(paperState, currentPrices);

    // Always save — equity snapshots are taken every minute now
    await saveState(PAPER_KEY, paperState);

    // Update health
    await saveState(HEALTH_KEY, {
      status: 'running', lastHeartbeat: Date.now(), isOnline: true,
      paperEquity: paperState.equity, openPositions: paperState.openPositions.length,
    });

    return Response.json({
      ok: true,
      paperChanged,
      equity: paperState.equity,
      openPositions: paperState.openPositions.length,
    });
  } catch (err) {
    console.error('Cron check error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
