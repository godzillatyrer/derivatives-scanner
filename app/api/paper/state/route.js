import { NextResponse } from "next/server";
import { fetchMarketUniverse } from "@/lib/hyperliquid";
import { calculateWinRate, readPaperState, writePaperState } from "@/lib/paperStore";

function closeTrade(trade, exitPrice, reason) {
  const pnl =
    trade.direction === "long"
      ? (exitPrice - trade.entry) * trade.qty
      : (trade.entry - exitPrice) * trade.qty;

  return {
    ...trade,
    status: reason,
    exitPrice,
    pnl,
    closedAt: new Date().toISOString()
  };
}

export async function GET() {
  try {
    const state = await readPaperState();

    let priceMap = new Map();
    try {
      const market = await fetchMarketUniverse();
      priceMap = new Map(market.map((m) => [m.symbol, m.price]));
    } catch {
      // Keep API responsive even if external market feed is temporarily unavailable.
    }

    const stillOpen = [];
    const justClosed = [];
    let balance = state.balance;
    let wins = state.wins;
    let losses = state.losses;

    for (const trade of state.openTrades) {
      const price = priceMap.get(trade.symbol);
      if (!price) {
        stillOpen.push({ ...trade, markPrice: trade.markPrice ?? trade.entry, unrealizedPnl: trade.unrealizedPnl ?? 0 });
        continue;
      }

      const hitTp = trade.direction === "long" ? price >= trade.tp : price <= trade.tp;
      const hitSl = trade.direction === "long" ? price <= trade.sl : price >= trade.sl;

      if (hitTp || hitSl) {
        const closed = closeTrade(trade, price, hitTp ? "tp" : "sl");
        balance += closed.pnl;
        if (closed.pnl >= 0) wins += 1;
        else losses += 1;
        justClosed.push(closed);
      } else {
        const unrealized =
          trade.direction === "long"
            ? (price - trade.entry) * trade.qty
            : (trade.entry - price) * trade.qty;
        stillOpen.push({ ...trade, markPrice: price, unrealizedPnl: unrealized });
      }
    }

    const closedTrades = [...justClosed, ...state.closedTrades].slice(0, 500);
    const equity =
      balance + stillOpen.reduce((sum, t) => sum + (t.unrealizedPnl || 0), 0);

    const next = await writePaperState({
      ...state,
      balance,
      equity,
      wins,
      losses,
      openTrades: stillOpen,
      closedTrades
    });

    return NextResponse.json({
      ...next,
      winRate: calculateWinRate(next)
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load paper state", details: String(error?.message || error) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const reset = {
    balance: 10000,
    equity: 10000,
    riskPerTradePct: 1,
    wins: 0,
    losses: 0,
    openTrades: [],
    closedTrades: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const saved = await writePaperState(reset);
  return NextResponse.json({ ...saved, winRate: 0 });
}
