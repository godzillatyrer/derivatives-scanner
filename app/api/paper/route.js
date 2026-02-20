import { loadState, saveState } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const PAPER_KEY = 'paper-trading';

function defaultPaperState() {
  return {
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
  };
}

export async function GET() {
  try {
    const state = await loadState(PAPER_KEY, defaultPaperState);
    return Response.json(state);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (body.action === 'reset') {
      const state = defaultPaperState();
      if (body.balance) state.balance = body.balance;
      state.startingBalance = state.balance;
      state.equity = state.balance;
      state.stats.peakEquity = state.balance;
      await saveState(PAPER_KEY, state);
      return Response.json(state);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
