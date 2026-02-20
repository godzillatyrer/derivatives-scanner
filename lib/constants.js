export const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';
export const HYPERLIQUID_WS = 'wss://api.hyperliquid.xyz/ws';

export const TIMEFRAMES = ['15m', '1h', '4h', '1d'];

export const TIMEFRAME_WEIGHTS = {
  '15m': 0.15,
  '1h': 0.25,
  '4h': 0.35,
  '1d': 0.25,
};

export const TIMEFRAME_MS = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export const INDICATOR_DEFAULTS = {
  ema: { periods: [9, 21, 50, 200] },
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
  atr: { period: 14 },
  stochRsi: { rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dSmooth: 3 },
  bollingerBands: { period: 20, stdDev: 2 },
  adx: { period: 14 },
  ichimoku: { tenkan: 9, kijun: 26, senkou: 52 },
  obv: {},
  vwap: {},
  fibonacci: {},
  volumeProfile: { bins: 24 },
};

export const DEFAULT_INDICATOR_WEIGHTS = {
  ema: 0.12,
  rsi: 0.10,
  macd: 0.12,
  stochRsi: 0.08,
  bollingerBands: 0.08,
  adx: 0.08,
  ichimoku: 0.12,
  obv: 0.06,
  vwap: 0.08,
  fibonacci: 0.06,
  volumeProfile: 0.05,
  atr: 0.05,
};

export const SIGNAL_THRESHOLDS = {
  strongLong: 0.5,
  long: 0.3,
  neutral: -0.3,
  short: -0.5,
};

export const CONFIDENCE_MULTIPLIERS = {
  multiTimeframeAgreement: 1.2,
  conflictingSignals: 0.7,
  strongTrend: 1.15,
  lowVolatility: 0.85,
};

export const RISK_DEFAULTS = {
  atrMultiplierSL: 1.5,
  minRiskReward: 1.5,
  tpLevels: [1, 2, 3],
};

export const LEARNING_CONFIG = {
  learningRate: 0.1,
  baselineAccuracy: 0.5,
  batchSize: 20,
  maxHistory: 500,
  minWeight: 0.02,
  maxWeight: 0.25,
};
