import { promises as fs } from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "paper-trading.json");

function defaultState() {
  return {
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
}

export async function readPaperState() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    const init = defaultState();
    await writePaperState(init);
    return init;
  }
}

export async function writePaperState(state) {
  const next = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function calculateWinRate(state) {
  const total = state.wins + state.losses;
  if (!total) return 0;
  return (state.wins / total) * 100;
}
