// ─── EMA ──────────────────────────────────────────────
export function calcEMA(closes, period) {
  const result = [];
  if (closes.length < period) return result;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period - 1; i++) result.push(null);
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calcMultiEMA(closes, periods = [9, 21, 50, 200]) {
  const emas = {};
  for (const p of periods) {
    emas[p] = calcEMA(closes, p);
  }
  return emas;
}

// ─── RSI ──────────────────────────────────────────────
export function calcRSI(closes, period = 14) {
  const result = [];
  if (closes.length < period + 1) return result;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = 0; i < period; i++) result.push(null);
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push(rsi);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const val = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push(val);
  }
  return result;
}

// ─── MACD ─────────────────────────────────────────────
export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] == null || emaSlow[i] == null) {
      macdLine.push(null);
    } else {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }
  const validMacd = macdLine.filter(v => v !== null);
  const signalLine = calcEMA(validMacd, signal);
  const fullSignal = [];
  let vi = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      fullSignal.push(null);
    } else {
      fullSignal.push(signalLine[vi] ?? null);
      vi++;
    }
  }
  const histogram = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null || fullSignal[i] == null) {
      histogram.push(null);
    } else {
      histogram.push(macdLine[i] - fullSignal[i]);
    }
  }
  return { macd: macdLine, signal: fullSignal, histogram };
}

// ─── ATR ──────────────────────────────────────────────
export function calcATR(highs, lows, closes, period = 14) {
  const result = [];
  if (closes.length < period + 1) return result;
  const trueRanges = [0];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  let atr = trueRanges.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period; i++) result.push(null);
  result.push(atr);
  for (let i = period + 1; i < closes.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push(atr);
  }
  return result;
}

// ─── Stochastic RSI ───────────────────────────────────
export function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const rsiValues = calcRSI(closes, rsiPeriod);
  const validRsi = rsiValues.filter(v => v !== null);
  if (validRsi.length < stochPeriod) return { k: [], d: [] };
  const rawK = [];
  for (let i = 0; i < stochPeriod - 1; i++) rawK.push(null);
  for (let i = stochPeriod - 1; i < validRsi.length; i++) {
    const window = validRsi.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...window);
    const max = Math.max(...window);
    rawK.push(max === min ? 50 : ((validRsi[i] - min) / (max - min)) * 100);
  }
  const validK = rawK.filter(v => v !== null);
  const kLine = sma(validK, kSmooth);
  const dLine = sma(kLine, dSmooth);
  const padK = new Array(closes.length - kLine.length).fill(null).concat(kLine);
  const padD = new Array(closes.length - dLine.length).fill(null).concat(dLine);
  return { k: padK, d: padD };
}

function sma(data, period) {
  const result = [];
  if (data.length < period) return result;
  let sum = data.slice(0, period).reduce((a, b) => a + b, 0);
  result.push(sum / period);
  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    result.push(sum / period);
  }
  return result;
}

// ─── Bollinger Bands ──────────────────────────────────
export function calcBollingerBands(closes, period = 20, stdDev = 2) {
  const upper = [], middle = [], lower = [];
  if (closes.length < period) return { upper, middle, lower };
  for (let i = 0; i < period - 1; i++) {
    upper.push(null); middle.push(null); lower.push(null);
  }
  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    middle.push(mean);
    upper.push(mean + stdDev * sd);
    lower.push(mean - stdDev * sd);
  }
  return { upper, middle, lower };
}

// ─── ADX ──────────────────────────────────────────────
export function calcADX(highs, lows, closes, period = 14) {
  const adx = [], plusDI = [], minusDI = [];
  if (closes.length < period * 2 + 1) {
    return { adx, plusDI, minusDI };
  }
  const trArr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    trArr.push(tr);
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  let smoothTR = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  const dxValues = [];
  for (let i = 0; i < period; i++) {
    adx.push(null); plusDI.push(null); minusDI.push(null);
  }
  for (let i = period; i < trArr.length; i++) {
    if (i > period) {
      smoothTR = smoothTR - smoothTR / period + trArr[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    }
    const pdi = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
    const mdi = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
    plusDI.push(pdi);
    minusDI.push(mdi);
    const diSum = pdi + mdi;
    const dx = diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100;
    dxValues.push(dx);
    if (dxValues.length < period) {
      adx.push(null);
    } else if (dxValues.length === period) {
      adx.push(dxValues.reduce((a, b) => a + b, 0) / period);
    } else {
      const prevAdx = adx[adx.length - 1] || dx;
      adx.push((prevAdx * (period - 1) + dx) / period);
    }
  }
  return { adx, plusDI, minusDI };
}

// ─── Ichimoku Cloud ───────────────────────────────────
export function calcIchimoku(highs, lows, closes, tenkanPeriod = 9, kijunPeriod = 26, senkouPeriod = 52) {
  const len = closes.length;
  const tenkan = [], kijun = [], senkouA = [], senkouB = [], chikou = [];

  function midpoint(arr, end, period) {
    if (end < period - 1) return null;
    const slice = arr.slice(end - period + 1, end + 1);
    return (Math.max(...slice) + Math.min(...slice)) / 2;
  }

  for (let i = 0; i < len; i++) {
    tenkan.push(midpoint(highs, i, tenkanPeriod) !== null && midpoint(lows, i, tenkanPeriod) !== null
      ? (midpoint(highs, i, tenkanPeriod) + midpoint(lows, i, tenkanPeriod)) / 2 : null);
    kijun.push(midpoint(highs, i, kijunPeriod) !== null && midpoint(lows, i, kijunPeriod) !== null
      ? (midpoint(highs, i, kijunPeriod) + midpoint(lows, i, kijunPeriod)) / 2 : null);
  }

  // Recompute tenkan/kijun properly
  for (let i = 0; i < len; i++) {
    const hSliceT = highs.slice(Math.max(0, i - tenkanPeriod + 1), i + 1);
    const lSliceT = lows.slice(Math.max(0, i - tenkanPeriod + 1), i + 1);
    tenkan[i] = hSliceT.length >= tenkanPeriod ? (Math.max(...hSliceT) + Math.min(...lSliceT)) / 2 : null;

    const hSliceK = highs.slice(Math.max(0, i - kijunPeriod + 1), i + 1);
    const lSliceK = lows.slice(Math.max(0, i - kijunPeriod + 1), i + 1);
    kijun[i] = hSliceK.length >= kijunPeriod ? (Math.max(...hSliceK) + Math.min(...lSliceK)) / 2 : null;
  }

  for (let i = 0; i < len + kijunPeriod; i++) {
    const srcIdx = i - kijunPeriod;
    if (srcIdx >= 0 && tenkan[srcIdx] != null && kijun[srcIdx] != null) {
      senkouA.push((tenkan[srcIdx] + kijun[srcIdx]) / 2);
    } else {
      senkouA.push(null);
    }
    const hSlice = highs.slice(Math.max(0, (srcIdx) - senkouPeriod + 1), Math.max(0, srcIdx + 1));
    const lSlice = lows.slice(Math.max(0, (srcIdx) - senkouPeriod + 1), Math.max(0, srcIdx + 1));
    if (srcIdx >= senkouPeriod - 1 && hSlice.length >= senkouPeriod) {
      senkouB.push((Math.max(...hSlice) + Math.min(...lSlice)) / 2);
    } else {
      senkouB.push(null);
    }
  }

  for (let i = 0; i < len; i++) {
    chikou.push(i + kijunPeriod < len ? closes[i + kijunPeriod] : null);
  }

  return {
    tenkan: tenkan.slice(0, len),
    kijun: kijun.slice(0, len),
    senkouA: senkouA.slice(0, len),
    senkouB: senkouB.slice(0, len),
    chikou: chikou.slice(0, len),
  };
}

// ─── OBV ──────────────────────────────────────────────
export function calcOBV(closes, volumes) {
  const obv = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

// ─── VWAP ─────────────────────────────────────────────
export function calcVWAP(highs, lows, closes, volumes) {
  const vwap = [];
  let cumVol = 0, cumTPV = 0;
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVol += volumes[i];
    cumTPV += tp * volumes[i];
    vwap.push(cumVol === 0 ? closes[i] : cumTPV / cumVol);
  }
  return vwap;
}

// ─── Fibonacci Retracement Levels ─────────────────────
export function calcFibonacciLevels(highs, lows, lookback = 100) {
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);
  const swingHigh = Math.max(...recentHighs);
  const swingLow = Math.min(...recentLows);
  const diff = swingHigh - swingLow;
  return {
    high: swingHigh,
    low: swingLow,
    levels: {
      0: swingHigh,
      0.236: swingHigh - diff * 0.236,
      0.382: swingHigh - diff * 0.382,
      0.5: swingHigh - diff * 0.5,
      0.618: swingHigh - diff * 0.618,
      0.786: swingHigh - diff * 0.786,
      1: swingLow,
    },
  };
}

// ─── Volume Profile ───────────────────────────────────
export function calcVolumeProfile(closes, volumes, highs, lows, bins = 24) {
  if (closes.length === 0) return [];
  const priceHigh = Math.max(...highs);
  const priceLow = Math.min(...lows);
  const binSize = (priceHigh - priceLow) / bins;
  if (binSize === 0) return [];
  const profile = new Array(bins).fill(0).map((_, i) => ({
    priceLevel: priceLow + binSize * (i + 0.5),
    volume: 0,
  }));
  for (let i = 0; i < closes.length; i++) {
    const idx = Math.min(Math.floor((closes[i] - priceLow) / binSize), bins - 1);
    if (idx >= 0) profile[idx].volume += volumes[i];
  }
  const maxVol = Math.max(...profile.map(p => p.volume));
  return profile.map(p => ({ ...p, normalized: maxVol > 0 ? p.volume / maxVol : 0 }));
}

// ─── Support & Resistance Levels ─────────────────────
export function calcSupportResistance(highs, lows, closes, lookback = 100) {
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);
  const recentCloses = closes.slice(-lookback);

  // Find swing highs/lows (local extremes within a 5-bar window)
  const swingHighs = [];
  const swingLows = [];
  for (let i = 2; i < recentHighs.length - 2; i++) {
    if (recentHighs[i] > recentHighs[i - 1] && recentHighs[i] > recentHighs[i - 2] &&
        recentHighs[i] > recentHighs[i + 1] && recentHighs[i] > recentHighs[i + 2]) {
      swingHighs.push(recentHighs[i]);
    }
    if (recentLows[i] < recentLows[i - 1] && recentLows[i] < recentLows[i - 2] &&
        recentLows[i] < recentLows[i + 1] && recentLows[i] < recentLows[i + 2]) {
      swingLows.push(recentLows[i]);
    }
  }

  // Cluster nearby levels (within 0.5% of each other)
  function clusterLevels(levels) {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters = [];
    let cluster = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - cluster[0]) / cluster[0] < 0.005) {
        cluster.push(sorted[i]);
      } else {
        clusters.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);
        cluster = [sorted[i]];
      }
    }
    clusters.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);
    return clusters;
  }

  const price = recentCloses[recentCloses.length - 1];
  const resistanceLevels = clusterLevels(swingHighs).filter(l => l > price).sort((a, b) => a - b);
  const supportLevels = clusterLevels(swingLows).filter(l => l < price).sort((a, b) => b - a);

  return {
    resistance: resistanceLevels.slice(0, 3),
    support: supportLevels.slice(0, 3),
    nearestResistance: resistanceLevels[0] || null,
    nearestSupport: supportLevels[0] || null,
  };
}

// ─── Compute all indicators for a candle set ──────────
export function computeAllIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  return {
    ema: calcMultiEMA(closes),
    rsi: calcRSI(closes),
    macd: calcMACD(closes),
    atr: calcATR(highs, lows, closes),
    stochRsi: calcStochRSI(closes),
    bollingerBands: calcBollingerBands(closes),
    adx: calcADX(highs, lows, closes),
    ichimoku: calcIchimoku(highs, lows, closes),
    obv: calcOBV(closes, volumes),
    vwap: calcVWAP(highs, lows, closes, volumes),
    fibonacci: calcFibonacciLevels(highs, lows),
    volumeProfile: calcVolumeProfile(closes, volumes, highs, lows),
    supportResistance: calcSupportResistance(highs, lows, closes),
    closes,
    highs,
    lows,
    volumes,
  };
}
