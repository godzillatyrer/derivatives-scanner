import { computeAllIndicators } from './indicators.js';
import { TIMEFRAME_WEIGHTS, DEFAULT_INDICATOR_WEIGHTS, RISK_DEFAULTS } from './constants.js';
import { classifySignalDirection } from './utils.js';

// ─── Per-indicator signal scoring (-1 to +1) ──────────

function scoreEMA(ind) {
  const ema = ind.ema;
  const closes = ind.closes;
  const price = closes[closes.length - 1];
  if (!ema[9] || !ema[21] || !ema[50]) return { score: 0, detail: 'Insufficient data' };

  const e9 = last(ema[9]), e21 = last(ema[21]), e50 = last(ema[50]);
  const e200 = ema[200] ? last(ema[200]) : null;
  let score = 0;
  const details = [];

  if (e9 > e21) { score += 0.3; details.push('9 EMA > 21 EMA (bullish)'); }
  else { score -= 0.3; details.push('9 EMA < 21 EMA (bearish)'); }

  if (e21 > e50) { score += 0.2; details.push('21 EMA > 50 EMA (uptrend)'); }
  else { score -= 0.2; details.push('21 EMA < 50 EMA (downtrend)'); }

  if (e200 != null) {
    if (price > e200) { score += 0.3; details.push('Price above 200 EMA (major uptrend)'); }
    else { score -= 0.3; details.push('Price below 200 EMA (major downtrend)'); }
  }

  // Crossover detection
  const prev9 = secondLast(ema[9]), prev21 = secondLast(ema[21]);
  if (prev9 != null && prev21 != null) {
    if (prev9 < prev21 && e9 > e21) { score += 0.2; details.push('Bullish 9/21 EMA crossover'); }
    else if (prev9 > prev21 && e9 < e21) { score -= 0.2; details.push('Bearish 9/21 EMA crossover'); }
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreRSI(ind) {
  const rsi = last(ind.rsi);
  if (rsi == null) return { score: 0, detail: 'Insufficient data' };
  let score = 0;
  const details = [];

  if (rsi < 30) { score = 0.7; details.push(`RSI oversold at ${rsi.toFixed(1)}`); }
  else if (rsi < 40) { score = 0.3; details.push(`RSI approaching oversold at ${rsi.toFixed(1)}`); }
  else if (rsi > 70) { score = -0.7; details.push(`RSI overbought at ${rsi.toFixed(1)}`); }
  else if (rsi > 60) { score = -0.3; details.push(`RSI approaching overbought at ${rsi.toFixed(1)}`); }
  else { details.push(`RSI neutral at ${rsi.toFixed(1)}`); }

  // Divergence detection
  const rsiArr = ind.rsi.filter(v => v !== null);
  const closes = ind.closes;
  if (rsiArr.length >= 10) {
    const recentRSI = rsiArr.slice(-10);
    const recentClose = closes.slice(-10);
    const rsiTrend = recentRSI[recentRSI.length - 1] - recentRSI[0];
    const priceTrend = recentClose[recentClose.length - 1] - recentClose[0];
    if (priceTrend < 0 && rsiTrend > 0) {
      score += 0.3;
      details.push('Bullish RSI divergence detected');
    } else if (priceTrend > 0 && rsiTrend < 0) {
      score -= 0.3;
      details.push('Bearish RSI divergence detected');
    }
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreMACD(ind) {
  const macd = last(ind.macd.macd);
  const signal = last(ind.macd.signal);
  const hist = last(ind.macd.histogram);
  if (macd == null || signal == null) return { score: 0, detail: 'Insufficient data' };

  let score = 0;
  const details = [];

  if (macd > signal) { score += 0.4; details.push('MACD above signal line'); }
  else { score -= 0.4; details.push('MACD below signal line'); }

  if (hist != null) {
    const prevHist = secondLast(ind.macd.histogram);
    if (prevHist != null) {
      if (hist > prevHist && hist > 0) { score += 0.3; details.push('Histogram expanding bullish'); }
      else if (hist < prevHist && hist < 0) { score -= 0.3; details.push('Histogram expanding bearish'); }
    }
  }

  // Crossover
  const prevMacd = secondLast(ind.macd.macd);
  const prevSig = secondLast(ind.macd.signal);
  if (prevMacd != null && prevSig != null) {
    if (prevMacd < prevSig && macd > signal) { score += 0.3; details.push('Bullish MACD crossover'); }
    else if (prevMacd > prevSig && macd < signal) { score -= 0.3; details.push('Bearish MACD crossover'); }
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreStochRSI(ind) {
  const k = last(ind.stochRsi.k);
  const d = last(ind.stochRsi.d);
  if (k == null) return { score: 0, detail: 'Insufficient data' };
  let score = 0;
  const details = [];

  if (k < 20) { score += 0.6; details.push(`Stoch RSI oversold (K: ${k.toFixed(1)})`); }
  else if (k > 80) { score -= 0.6; details.push(`Stoch RSI overbought (K: ${k.toFixed(1)})`); }
  else { details.push(`Stoch RSI neutral (K: ${k.toFixed(1)})`); }

  if (d != null) {
    if (k > d && k < 30) { score += 0.4; details.push('Bullish K/D crossover in oversold zone'); }
    else if (k < d && k > 70) { score -= 0.4; details.push('Bearish K/D crossover in overbought zone'); }
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreBollingerBands(ind) {
  const price = last(ind.closes);
  const upper = last(ind.bollingerBands.upper);
  const lower = last(ind.bollingerBands.lower);
  const middle = last(ind.bollingerBands.middle);
  if (upper == null || lower == null) return { score: 0, detail: 'Insufficient data' };

  let score = 0;
  const details = [];
  const bandwidth = (upper - lower) / middle;

  if (price <= lower) { score = 0.6; details.push('Price at lower Bollinger Band (potential bounce)'); }
  else if (price >= upper) { score = -0.6; details.push('Price at upper Bollinger Band (potential rejection)'); }
  else if (price > middle) { score = -0.1; details.push('Price above BB middle'); }
  else { score = 0.1; details.push('Price below BB middle'); }

  if (bandwidth < 0.03) { details.push('Bollinger squeeze detected - volatility expansion imminent'); }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreADX(ind) {
  const adx = last(ind.adx.adx);
  const plusDI = last(ind.adx.plusDI);
  const minusDI = last(ind.adx.minusDI);
  if (adx == null) return { score: 0, detail: 'Insufficient data' };

  let score = 0;
  const details = [];

  if (adx > 25) {
    details.push(`Strong trend (ADX: ${adx.toFixed(1)})`);
    if (plusDI != null && minusDI != null) {
      if (plusDI > minusDI) { score = 0.5; details.push('+DI dominant (bullish trend)'); }
      else { score = -0.5; details.push('-DI dominant (bearish trend)'); }
    }
  } else {
    details.push(`Weak/no trend (ADX: ${adx.toFixed(1)})`);
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreIchimoku(ind) {
  const price = last(ind.closes);
  const tenkan = last(ind.ichimoku.tenkan);
  const kijun = last(ind.ichimoku.kijun);
  const senkouA = last(ind.ichimoku.senkouA);
  const senkouB = last(ind.ichimoku.senkouB);
  if (tenkan == null || kijun == null) return { score: 0, detail: 'Insufficient data' };

  let score = 0;
  const details = [];

  if (tenkan > kijun) { score += 0.25; details.push('Tenkan above Kijun (bullish)'); }
  else { score -= 0.25; details.push('Tenkan below Kijun (bearish)'); }

  if (senkouA != null && senkouB != null) {
    const cloudTop = Math.max(senkouA, senkouB);
    const cloudBottom = Math.min(senkouA, senkouB);
    if (price > cloudTop) { score += 0.4; details.push('Price above cloud (bullish)'); }
    else if (price < cloudBottom) { score -= 0.4; details.push('Price below cloud (bearish)'); }
    else { details.push('Price inside cloud (indecision)'); }

    if (senkouA > senkouB) { score += 0.15; details.push('Bullish cloud'); }
    else { score -= 0.15; details.push('Bearish cloud'); }
  }

  // TK Cross
  const prevTenkan = secondLast(ind.ichimoku.tenkan);
  const prevKijun = secondLast(ind.ichimoku.kijun);
  if (prevTenkan != null && prevKijun != null) {
    if (prevTenkan < prevKijun && tenkan > kijun) { score += 0.2; details.push('Bullish TK cross'); }
    else if (prevTenkan > prevKijun && tenkan < kijun) { score -= 0.2; details.push('Bearish TK cross'); }
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreOBV(ind) {
  const obv = ind.obv;
  if (obv.length < 20) return { score: 0, detail: 'Insufficient data' };
  const recent = obv.slice(-20);
  const obvTrend = recent[recent.length - 1] - recent[0];
  const closes = ind.closes.slice(-20);
  const priceTrend = closes[closes.length - 1] - closes[0];
  const details = [];
  let score = 0;

  if (obvTrend > 0 && priceTrend > 0) {
    score = 0.4; details.push('OBV confirming uptrend (volume supporting price)');
  } else if (obvTrend < 0 && priceTrend < 0) {
    score = -0.4; details.push('OBV confirming downtrend (volume supporting decline)');
  } else if (obvTrend > 0 && priceTrend < 0) {
    score = 0.5; details.push('Bullish OBV divergence (accumulation)');
  } else if (obvTrend < 0 && priceTrend > 0) {
    score = -0.5; details.push('Bearish OBV divergence (distribution)');
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreVWAP(ind) {
  const price = last(ind.closes);
  const vwap = last(ind.vwap);
  if (vwap == null) return { score: 0, detail: 'Insufficient data' };
  const diff = (price - vwap) / vwap;
  const details = [];
  let score = 0;

  if (price > vwap) {
    score = Math.min(diff * 10, 0.5);
    details.push(`Price ${(diff * 100).toFixed(2)}% above VWAP (bullish)`);
  } else {
    score = Math.max(diff * 10, -0.5);
    details.push(`Price ${(Math.abs(diff) * 100).toFixed(2)}% below VWAP (bearish)`);
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreFibonacci(ind) {
  const price = last(ind.closes);
  const fib = ind.fibonacci;
  if (!fib) return { score: 0, detail: 'Insufficient data' };
  const levels = fib.levels;
  const details = [];
  let score = 0;

  const position = (price - levels[1]) / (levels[0] - levels[1]);
  if (position > 0.786) { score = -0.3; details.push('Price near swing high (resistance zone)'); }
  else if (position > 0.618) { score = -0.1; details.push('Price between 61.8%-78.6% fib (upper zone)'); }
  else if (position > 0.382) { score = 0; details.push('Price in middle fib range'); }
  else if (position > 0.236) { score = 0.2; details.push('Price near 23.6%-38.2% fib (support zone)'); }
  else { score = 0.4; details.push('Price near swing low (strong support)'); }

  // Check proximity to key levels
  for (const [level, value] of Object.entries(levels)) {
    if (Math.abs(price - value) / price < 0.005) {
      details.push(`Price at ${(parseFloat(level) * 100).toFixed(1)}% fib level`);
    }
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreVolumeProfile(ind) {
  const price = last(ind.closes);
  const profile = ind.volumeProfile;
  if (!profile || profile.length === 0) return { score: 0, detail: 'Insufficient data' };

  const pocBin = profile.reduce((max, bin) => bin.volume > max.volume ? bin : max, profile[0]);
  const details = [];
  let score = 0;

  if (price > pocBin.priceLevel) {
    score = 0.2;
    details.push(`Price above Point of Control (${pocBin.priceLevel.toFixed(2)})`);
  } else {
    score = -0.2;
    details.push(`Price below Point of Control (${pocBin.priceLevel.toFixed(2)})`);
  }

  return { score: clamp(score, -1, 1), detail: details.join('. ') };
}

function scoreATR(ind) {
  const atr = last(ind.atr);
  const price = last(ind.closes);
  if (atr == null) return { score: 0, detail: 'Insufficient data' };
  const atrPct = (atr / price) * 100;
  return { score: 0, detail: `ATR: ${atr.toFixed(4)} (${atrPct.toFixed(2)}% of price). Used for TP/SL sizing.` };
}

// ─── Score all indicators for a candle set ────────────
const SCORERS = {
  ema: scoreEMA,
  rsi: scoreRSI,
  macd: scoreMACD,
  stochRsi: scoreStochRSI,
  bollingerBands: scoreBollingerBands,
  adx: scoreADX,
  ichimoku: scoreIchimoku,
  obv: scoreOBV,
  vwap: scoreVWAP,
  fibonacci: scoreFibonacci,
  volumeProfile: scoreVolumeProfile,
  atr: scoreATR,
};

export function scoreIndicators(candles, weights = DEFAULT_INDICATOR_WEIGHTS) {
  const indicators = computeAllIndicators(candles);
  const results = {};
  let totalScore = 0;
  let totalWeight = 0;

  for (const [name, scorer] of Object.entries(SCORERS)) {
    const { score, detail } = scorer(indicators);
    const weight = weights[name] || DEFAULT_INDICATOR_WEIGHTS[name] || 0;
    results[name] = { score, weight, weightedScore: score * weight, detail };
    totalScore += score * weight;
    totalWeight += weight;
  }

  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  return { normalizedScore, indicators: results, raw: indicators };
}

// ─── Multi-timeframe signal generation ────────────────
export function generateSignal(timeframeData, weights = DEFAULT_INDICATOR_WEIGHTS) {
  let compositeScore = 0;
  const timeframeResults = {};
  const allIndicatorDetails = [];
  let validTimeframes = 0;

  for (const [tf, candles] of Object.entries(timeframeData)) {
    if (!candles || candles.length < 52) continue;
    const tfWeight = TIMEFRAME_WEIGHTS[tf] || 0.25;
    const { normalizedScore, indicators } = scoreIndicators(candles, weights);
    compositeScore += normalizedScore * tfWeight;
    timeframeResults[tf] = {
      score: normalizedScore,
      direction: classifySignalDirection(normalizedScore),
      indicators,
    };
    validTimeframes++;
  }

  if (validTimeframes === 0) return null;

  // Normalize composite score
  const totalTfWeight = Object.keys(timeframeResults).reduce(
    (sum, tf) => sum + (TIMEFRAME_WEIGHTS[tf] || 0.25), 0
  );
  compositeScore = compositeScore / totalTfWeight;

  // Calculate confidence
  const directions = Object.values(timeframeResults).map(r => r.direction);
  const allBullish = directions.every(d => d.includes('LONG'));
  const allBearish = directions.every(d => d.includes('SHORT'));
  const aligned = allBullish || allBearish;

  let confidence = Math.abs(compositeScore) * 100;
  if (aligned) confidence *= 1.2;
  if (!aligned && directions.some(d => d.includes('LONG')) && directions.some(d => d.includes('SHORT'))) {
    confidence *= 0.7;
  }
  confidence = Math.min(Math.round(confidence), 99);

  const direction = classifySignalDirection(compositeScore);

  // Build reasoning
  const primaryTf = timeframeResults['4h'] || timeframeResults['1h'] || Object.values(timeframeResults)[0];
  const indicatorReasons = [];
  if (primaryTf) {
    for (const [name, data] of Object.entries(primaryTf.indicators)) {
      if (data.detail && data.detail !== 'Insufficient data') {
        indicatorReasons.push({
          name: formatIndicatorName(name),
          signal: data.score > 0.1 ? 'bullish' : data.score < -0.1 ? 'bearish' : 'neutral',
          score: data.score,
          detail: data.detail,
        });
      }
    }
  }

  // Sort by absolute score (strongest signals first)
  indicatorReasons.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const tfSummary = {};
  for (const [tf, data] of Object.entries(timeframeResults)) {
    tfSummary[tf] = data.direction.toLowerCase().replace('strong_', 'strong ').replace('_', ' ');
  }

  const bullishCount = indicatorReasons.filter(r => r.signal === 'bullish').length;
  const bearishCount = indicatorReasons.filter(r => r.signal === 'bearish').length;

  let summary;
  if (direction.includes('LONG')) {
    summary = `Bullish confluence: ${bullishCount} indicators bullish vs ${bearishCount} bearish across ${validTimeframes} timeframes`;
  } else if (direction.includes('SHORT')) {
    summary = `Bearish confluence: ${bearishCount} indicators bearish vs ${bullishCount} bullish across ${validTimeframes} timeframes`;
  } else {
    summary = `Mixed signals: ${bullishCount} bullish, ${bearishCount} bearish - no clear direction`;
  }

  return {
    direction,
    score: compositeScore,
    confidence,
    reasoning: {
      summary,
      indicators: indicatorReasons,
      timeframes: tfSummary,
      riskLevel: confidence > 70 ? 'low' : confidence > 45 ? 'medium' : 'high',
    },
    timeframeResults,
    timestamp: Date.now(),
  };
}

// ─── TP/SL calculation ────────────────────────────────
export function calculateTPSL(signal, candles, learningState = null) {
  const price = candles[candles.length - 1].close;
  const indicators = computeAllIndicators(candles);
  const atr = last(indicators.atr);

  if (!atr) return null;

  const slMultiplier = learningState?.atrMultiplierSL || RISK_DEFAULTS.atrMultiplierSL;
  const isLong = signal.direction.includes('LONG');
  const slDistance = atr * slMultiplier;

  const stopLoss = isLong ? price - slDistance : price + slDistance;

  // TP based on R:R ratios
  const takeProfits = RISK_DEFAULTS.tpLevels.map(rr => {
    const tpDistance = slDistance * rr * (learningState?.rrMultiplier || 1.5);
    return isLong ? price + tpDistance : price - tpDistance;
  });

  // Also find nearest Fibonacci levels for TP
  const fib = indicators.fibonacci;
  let fibTP = null;
  if (fib) {
    const fibLevels = Object.values(fib.levels).sort((a, b) => a - b);
    if (isLong) {
      fibTP = fibLevels.find(l => l > price * 1.005);
    } else {
      fibTP = [...fibLevels].reverse().find(l => l < price * 0.995);
    }
  }

  return {
    entry: price,
    stopLoss: parseFloat(stopLoss.toPrecision(6)),
    takeProfits: takeProfits.map(tp => parseFloat(tp.toPrecision(6))),
    fibTarget: fibTP ? parseFloat(fibTP.toPrecision(6)) : null,
    atr,
    riskPercent: ((slDistance / price) * 100).toFixed(2),
  };
}

// ─── Helpers ──────────────────────────────────────────
function last(arr) {
  if (!arr || arr.length === 0) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

function secondLast(arr) {
  if (!arr || arr.length < 2) return null;
  let found = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) {
      found++;
      if (found === 2) return arr[i];
    }
  }
  return null;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function formatIndicatorName(name) {
  const names = {
    ema: 'EMA System',
    rsi: 'RSI',
    macd: 'MACD',
    stochRsi: 'Stochastic RSI',
    bollingerBands: 'Bollinger Bands',
    adx: 'ADX',
    ichimoku: 'Ichimoku Cloud',
    obv: 'OBV',
    vwap: 'VWAP',
    fibonacci: 'Fibonacci',
    volumeProfile: 'Volume Profile',
    atr: 'ATR',
  };
  return names[name] || name;
}
