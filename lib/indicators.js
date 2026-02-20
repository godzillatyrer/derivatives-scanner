function last(arr) {
  return arr[arr.length - 1] ?? null;
}

function emaSeries(values, period) {
  if (!values || values.length < period) return [];
  const result = [];
  const alpha = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  result[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    const next = values[i] * alpha + prev * (1 - alpha);
    result[i] = next;
    prev = next;
  }

  return result;
}

function sma(values, period) {
  if (!values || values.length < period) return null;
  const tail = values.slice(-period);
  return tail.reduce((sum, value) => sum + value, 0) / period;
}

export function calcEMA(values, period) {
  const series = emaSeries(values, period);
  return last(series);
}

export function calcRSI(values, period = 14) {
  if (!values || values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calcMACD(values, fast = 12, slow = 26, signalPeriod = 9) {
  if (!values || values.length < slow + signalPeriod) {
    return { macd: null, signal: null, hist: null, prevHist: null };
  }

  const fastEma = emaSeries(values, fast);
  const slowEma = emaSeries(values, slow);
  const macdLine = values.map((_, i) =>
    fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null
  );
  const valid = macdLine.filter((v) => v != null);
  const signalSeries = emaSeries(valid, signalPeriod);

  const macd = last(valid);
  const signal = last(signalSeries);
  const prevMacd = valid[valid.length - 2] ?? null;
  const prevSignal = signalSeries[signalSeries.length - 2] ?? null;

  return {
    macd,
    signal,
    hist: macd != null && signal != null ? macd - signal : null,
    prevHist: prevMacd != null && prevSignal != null ? prevMacd - prevSignal : null
  };
}

export function calcATR(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || closes.length <= period) return null;
  const tr = [];

  for (let i = 1; i < closes.length; i++) {
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    );
  }

  if (tr.length < period) return null;
  return tr.slice(-period).reduce((sum, v) => sum + v, 0) / period;
}

export function calcStochastic(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || closes.length < period) return null;
  const hi = Math.max(...highs.slice(-period));
  const lo = Math.min(...lows.slice(-period));
  if (hi === lo) return 50;
  return ((last(closes) - lo) / (hi - lo)) * 100;
}

export function calcBollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  if (mid == null) return { upper: null, middle: null, lower: null };

  const segment = values.slice(-period);
  const variance = segment.reduce((acc, v) => acc + (v - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);

  return {
    upper: mid + sd * mult,
    middle: mid,
    lower: mid - sd * mult
  };
}

export function generateSignal({ price, ema20, ema50, ema200, rsi, macd, atr, stoch, bollinger, tf, tuning }) {
  if ([price, ema20, ema50, ema200, rsi, atr, stoch].some((v) => v == null) || macd?.hist == null) {
    return {
      direction: "neutral",
      confidence: 0,
      score: 0,
      entry: null,
      tp: null,
      sl: null,
      reason: `Not enough data for ${tf}`
    };
  }

  let longScore = 0;
  let shortScore = 0;
  const bullets = [];

  if (price > ema200) {
    longScore += 2;
    bullets.push("Trend above EMA200");
  } else {
    shortScore += 2;
    bullets.push("Trend below EMA200");
  }

  if (ema20 > ema50) {
    longScore += 1;
    bullets.push("EMA20 > EMA50");
  } else {
    shortScore += 1;
    bullets.push("EMA20 < EMA50");
  }

  if (rsi > 53 && rsi < 74) longScore += 1;
  if (rsi < 47 && rsi > 26) shortScore += 1;

  if (macd.hist > 0 && macd.prevHist != null && macd.hist > macd.prevHist) longScore += 1;
  if (macd.hist < 0 && macd.prevHist != null && macd.hist < macd.prevHist) shortScore += 1;

  if (stoch > 55 && stoch < 90) longScore += 1;
  if (stoch < 45 && stoch > 10) shortScore += 1;

  if (bollinger.upper != null && bollinger.lower != null) {
    const width = (bollinger.upper - bollinger.lower) / price;
    if (width > 0.02) bullets.push("Volatility supports directional move");
  }

  const score = longScore - shortScore;
  const direction = score >= 2 ? "long" : score <= -2 ? "short" : "neutral";
  const confidence = direction === "neutral" ? 35 : Math.min(95, 52 + Math.abs(score) * 11);

  const rr = tuning?.rr ?? 1.8;
  const slAtr = tuning?.slAtr ?? 1.4;
  const stopDistance = atr * slAtr;

  const sl = direction === "long" ? price - stopDistance : direction === "short" ? price + stopDistance : null;
  const tp = direction === "long" ? price + stopDistance * rr : direction === "short" ? price - stopDistance * rr : null;

  const reason = [
    `Timeframe: ${tf}`,
    `Signal: ${direction.toUpperCase()} (${confidence}% confidence)` ,
    `EMA20/EMA50/EMA200: ${ema20.toFixed(4)} / ${ema50.toFixed(4)} / ${ema200.toFixed(4)}`,
    `RSI: ${rsi.toFixed(2)} · MACD Hist: ${macd.hist.toFixed(5)} · Stoch: ${stoch.toFixed(2)}`,
    `Entry: ${price.toFixed(4)} · TP: ${tp ? tp.toFixed(4) : "-"} · SL: ${sl ? sl.toFixed(4) : "-"}`,
    "",
    "Reasoning:",
    ...bullets.map((b) => `- ${b}`),
    direction === "neutral" ? "- Indicators are mixed; no high-conviction setup." : `- Planned risk/reward: ${rr.toFixed(2)}R`
  ].join("\n");

  return { direction, confidence, score, entry: price, tp, sl, reason, riskReward: rr };
}
