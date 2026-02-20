import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = join(process.cwd(), 'data');
const PAPER_FILE = join(DATA_DIR, 'paper-trading.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function defaultPaperState() {
  return {
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
  };
}

function loadPaperState() {
  ensureDataDir();
  try {
    return JSON.parse(readFileSync(PAPER_FILE, 'utf-8'));
  } catch {
    return defaultPaperState();
  }
}

function savePaperState(state) {
  ensureDataDir();
  writeFileSync(PAPER_FILE, JSON.stringify(state, null, 2));
}

export async function GET() {
  try {
    const state = loadPaperState();
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
      savePaperState(state);
      return Response.json(state);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
