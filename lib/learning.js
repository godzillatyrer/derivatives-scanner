import { DEFAULT_INDICATOR_WEIGHTS, LEARNING_CONFIG } from './constants';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const STATE_FILE = join(DATA_DIR, 'learning-state.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function defaultState() {
  return {
    version: 1,
    weights: { ...DEFAULT_INDICATOR_WEIGHTS },
    history: [],
    stats: {
      totalSignals: 0,
      wins: 0,
      losses: 0,
      expired: 0,
      winRate: 0,
      avgProfit: 0,
      avgLoss: 0,
      profitFactor: 0,
      indicatorAccuracy: {},
      coinPerformance: {},
    },
    atrMultiplierSL: 1.5,
    rrMultiplier: 1.5,
    lastOptimized: null,
    weightHistory: [],
  };
}

export function loadLearningState() {
  ensureDataDir();
  try {
    const data = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultState();
  }
}

export function saveLearningState(state) {
  ensureDataDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function recordSignal(signal) {
  const state = loadLearningState();
  state.history.push({
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    coin: signal.coin,
    direction: signal.direction,
    confidence: signal.confidence,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    takeProfits: signal.takeProfits,
    indicators: signal.indicatorScores,
    timestamp: Date.now(),
    outcome: null,
    exitPrice: null,
    exitTime: null,
    pnlPercent: null,
  });

  // Keep history bounded
  if (state.history.length > LEARNING_CONFIG.maxHistory) {
    state.history = state.history.slice(-LEARNING_CONFIG.maxHistory);
  }

  state.stats.totalSignals++;
  saveLearningState(state);
  return state;
}

export function resolveSignal(signalId, outcome, exitPrice) {
  const state = loadLearningState();
  const signal = state.history.find(s => s.id === signalId);
  if (!signal) return state;

  signal.outcome = outcome; // 'win', 'loss', 'expired'
  signal.exitPrice = exitPrice;
  signal.exitTime = Date.now();

  if (signal.entry && exitPrice) {
    const isLong = signal.direction?.includes('LONG');
    signal.pnlPercent = isLong
      ? ((exitPrice - signal.entry) / signal.entry) * 100
      : ((signal.entry - exitPrice) / signal.entry) * 100;
  }

  // Update stats
  recalculateStats(state);

  // Check if we should optimize weights
  const pendingCount = state.history.filter(s => s.outcome && s.exitTime > (state.lastOptimized || 0)).length;
  if (pendingCount >= LEARNING_CONFIG.batchSize) {
    optimizeWeights(state);
  }

  saveLearningState(state);
  return state;
}

function recalculateStats(state) {
  const resolved = state.history.filter(s => s.outcome);
  const wins = resolved.filter(s => s.outcome === 'win');
  const losses = resolved.filter(s => s.outcome === 'loss');

  state.stats.wins = wins.length;
  state.stats.losses = losses.length;
  state.stats.expired = resolved.filter(s => s.outcome === 'expired').length;
  state.stats.winRate = resolved.length > 0 ? wins.length / resolved.length : 0;

  const profits = wins.map(s => s.pnlPercent || 0);
  const lossesPnl = losses.map(s => Math.abs(s.pnlPercent || 0));

  state.stats.avgProfit = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
  state.stats.avgLoss = lossesPnl.length > 0 ? lossesPnl.reduce((a, b) => a + b, 0) / lossesPnl.length : 0;

  const totalProfit = profits.reduce((a, b) => a + b, 0);
  const totalLoss = lossesPnl.reduce((a, b) => a + b, 0);
  state.stats.profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  // Per-indicator accuracy
  const indicatorStats = {};
  for (const sig of resolved) {
    if (!sig.indicators) continue;
    for (const [name, data] of Object.entries(sig.indicators)) {
      if (!indicatorStats[name]) indicatorStats[name] = { correct: 0, total: 0 };
      indicatorStats[name].total++;
      const indicatorBullish = data.score > 0;
      const signalWon = sig.outcome === 'win';
      const directionMatch = (sig.direction?.includes('LONG') && indicatorBullish) ||
        (sig.direction?.includes('SHORT') && !indicatorBullish);
      if ((signalWon && directionMatch) || (!signalWon && !directionMatch)) {
        // Indicator agreed with outcome
      }
      if (directionMatch === signalWon) {
        indicatorStats[name].correct++;
      }
    }
  }

  state.stats.indicatorAccuracy = {};
  for (const [name, stats] of Object.entries(indicatorStats)) {
    state.stats.indicatorAccuracy[name] = stats.total > 0 ? stats.correct / stats.total : 0.5;
  }

  // Per-coin performance
  const coinStats = {};
  for (const sig of resolved) {
    if (!sig.coin) continue;
    if (!coinStats[sig.coin]) coinStats[sig.coin] = { wins: 0, total: 0, pnl: 0 };
    coinStats[sig.coin].total++;
    if (sig.outcome === 'win') coinStats[sig.coin].wins++;
    coinStats[sig.coin].pnl += sig.pnlPercent || 0;
  }
  state.stats.coinPerformance = {};
  for (const [coin, stats] of Object.entries(coinStats)) {
    state.stats.coinPerformance[coin] = {
      winRate: stats.total > 0 ? stats.wins / stats.total : 0,
      totalTrades: stats.total,
      totalPnl: stats.pnl,
    };
  }
}

function optimizeWeights(state) {
  const { learningRate, baselineAccuracy, minWeight, maxWeight } = LEARNING_CONFIG;

  for (const [name, accuracy] of Object.entries(state.stats.indicatorAccuracy)) {
    if (state.weights[name] == null) continue;
    const adjustment = learningRate * (accuracy - baselineAccuracy);
    state.weights[name] = Math.max(minWeight, Math.min(maxWeight,
      state.weights[name] * (1 + adjustment)
    ));
  }

  // Normalize weights to sum to 1
  const totalWeight = Object.values(state.weights).reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    for (const key of Object.keys(state.weights)) {
      state.weights[key] /= totalWeight;
    }
  }

  // Adjust TP/SL parameters based on outcomes
  const recent = state.history.filter(s => s.outcome).slice(-50);
  if (recent.length >= 10) {
    const avgWinPnl = recent.filter(s => s.outcome === 'win')
      .map(s => Math.abs(s.pnlPercent || 0))
      .reduce((a, b, _, arr) => a + b / arr.length, 0);
    const avgLossPnl = recent.filter(s => s.outcome === 'loss')
      .map(s => Math.abs(s.pnlPercent || 0))
      .reduce((a, b, _, arr) => a + b / arr.length, 0);

    if (state.stats.winRate < 0.4 && avgLossPnl > 0) {
      state.atrMultiplierSL = Math.min(2.5, state.atrMultiplierSL * 1.05);
    } else if (state.stats.winRate > 0.6) {
      state.atrMultiplierSL = Math.max(1.0, state.atrMultiplierSL * 0.98);
    }

    if (avgWinPnl > 0 && avgLossPnl > 0) {
      const currentRR = avgWinPnl / avgLossPnl;
      if (currentRR < 1.5) {
        state.rrMultiplier = Math.min(3.0, state.rrMultiplier * 1.05);
      }
    }
  }

  state.lastOptimized = Date.now();
  state.weightHistory.push({
    timestamp: Date.now(),
    weights: { ...state.weights },
    winRate: state.stats.winRate,
    atrMultiplierSL: state.atrMultiplierSL,
    rrMultiplier: state.rrMultiplier,
  });

  // Keep weight history bounded
  if (state.weightHistory.length > 100) {
    state.weightHistory = state.weightHistory.slice(-100);
  }
}

export function checkSignalOutcomes(state, currentPrices) {
  let changed = false;
  for (const signal of state.history) {
    if (signal.outcome) continue;
    const price = currentPrices[signal.coin];
    if (!price) continue;

    const isLong = signal.direction?.includes('LONG');

    // Check stop loss
    if (isLong && price <= signal.stopLoss) {
      signal.outcome = 'loss';
      signal.exitPrice = signal.stopLoss;
      signal.exitTime = Date.now();
      signal.pnlPercent = ((signal.stopLoss - signal.entry) / signal.entry) * 100;
      changed = true;
    } else if (!isLong && price >= signal.stopLoss) {
      signal.outcome = 'loss';
      signal.exitPrice = signal.stopLoss;
      signal.exitTime = Date.now();
      signal.pnlPercent = ((signal.entry - signal.stopLoss) / signal.entry) * 100;
      changed = true;
    }

    // Check take profit (TP1)
    if (!signal.outcome && signal.takeProfits?.[0]) {
      const tp = signal.takeProfits[0];
      if (isLong && price >= tp) {
        signal.outcome = 'win';
        signal.exitPrice = tp;
        signal.exitTime = Date.now();
        signal.pnlPercent = ((tp - signal.entry) / signal.entry) * 100;
        changed = true;
      } else if (!isLong && price <= tp) {
        signal.outcome = 'win';
        signal.exitPrice = tp;
        signal.exitTime = Date.now();
        signal.pnlPercent = ((signal.entry - tp) / signal.entry) * 100;
        changed = true;
      }
    }

    // Expire old signals (48h for shorter TF, 7d max)
    if (!signal.outcome && Date.now() - signal.timestamp > 7 * 24 * 60 * 60 * 1000) {
      signal.outcome = 'expired';
      signal.exitPrice = price;
      signal.exitTime = Date.now();
      signal.pnlPercent = isLong
        ? ((price - signal.entry) / signal.entry) * 100
        : ((signal.entry - price) / signal.entry) * 100;
      changed = true;
    }
  }

  if (changed) {
    recalculateStats(state);
    const pendingCount = state.history.filter(s => s.outcome && s.exitTime > (state.lastOptimized || 0)).length;
    if (pendingCount >= LEARNING_CONFIG.batchSize) {
      optimizeWeights(state);
    }
    saveLearningState(state);
  }

  return state;
}
