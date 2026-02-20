import { NextResponse } from "next/server";
import { readPaperState, writePaperState } from "@/lib/paperStore";

function adaptiveRisk(winRate) {
  if (winRate >= 65) return 1.4;
  if (winRate >= 55) return 1.1;
  if (winRate <= 35) return 0.6;
  return 0.9;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      symbol,
      direction,
      entry,
      tp,
      sl,
      timeframe,
      reason,
      confidence = 0
    } = body || {};

    if (!symbol || !direction || !entry || !tp || !sl) {
      return NextResponse.json({ error: "Missing required trade fields" }, { status: 400 });
    }

    if (!["long", "short"].includes(direction)) {
      return NextResponse.json({ error: "Direction must be long or short" }, { status: 400 });
    }

    const state = await readPaperState();
    const duplicate = state.openTrades.find((t) => t.symbol === symbol);
    if (duplicate) {
      return NextResponse.json(
        { error: `Trade already open for ${symbol}` },
        { status: 409 }
      );
    }

    const total = state.wins + state.losses;
    const winRate = total ? (state.wins / total) * 100 : 50;
    const riskMultiplier = adaptiveRisk(winRate);

    const riskBudget = state.balance * (state.riskPerTradePct / 100) * riskMultiplier;
    const stopDistance = Math.abs(entry - sl);
    if (!stopDistance || stopDistance <= 0) {
      return NextResponse.json({ error: "Invalid stop distance" }, { status: 400 });
    }

    const qty = riskBudget / stopDistance;

    const trade = {
      id: `pt-${Date.now()}-${symbol}`,
      symbol,
      direction,
      entry,
      tp,
      sl,
      qty,
      riskBudget,
      timeframe,
      confidence,
      reason,
      status: "open",
      openedAt: new Date().toISOString()
    };

    const saved = await writePaperState({
      ...state,
      openTrades: [trade, ...state.openTrades]
    });

    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      { error: "Could not open paper trade", details: String(error?.message || error) },
      { status: 500 }
    );
  }
}
