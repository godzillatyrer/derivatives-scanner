// Simple helpers to calculate indicators using close prices

function emaArray(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [];
  // seed with simple moving average
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  ema[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const val = values[i];
    const next = val * k + prev * (1 - k);
    ema[i] = next;
    prev = next;
  }
  return ema;
}

function lastNonNull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && !Number.isNaN(arr[i])) return arr[i];
  }
  return null;
}

export function calcEMA(values, period) {
  const ema = emaArray(values, period);
  return lastNonNull(ema);
}

export function calcRSI(values, period = 14) {
  if (values.length <= period) return null;
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
  const rsi = 100 - 100 / (1 + rs);
  return rsi;
}

export function calcMACD(values, fast = 12, slow = 26, signalPeriod = 9) {
  if (values.length < slow + signalPeriod) {
    return { macd: null, signal: null, hist: null, prevHist: null };
  }

  const fastEMA = emaArray(values, fast);
  const slowEMA = emaArray(values, slow);

  const macdLine = [];
  for (let i = 0; i < values.length; i++) {
    if (fastEMA[i] != null && slowEMA[i] != null) {
      macdLine[i] = fastEMA[i] - slowEMA[i];
    } else {
      macdLine[i] = null;
    }
  }

  const validMacd = macdLine.filter((v) => v != null);
  const signalLine = emaArray(validMacd, signalPeriod);

  const lastMacd = validMacd[validMacd.length - 1];
  const prevMacd = validMacd[validMacd.length - 2];

  const lastSignal = lastNonNull(signalLine);
  const prevSignal =
    signalLine.length >= 2 ? signalLine[signalLine.length - 2] : null;

  const hist =
    lastMacd != null && lastSignal != null ? lastMacd - lastSignal : null;
  const prevHist =
    prevMacd != null && prevSignal != null ? prevMacd - prevSignal : null;

  return {
    macd: lastMacd,
    signal: lastSignal,
    hist,
    prevHist
  };
}

/**
 * Turn indicator values into a simple long/short/neutral signal + reason
 */
export function generateSignal({ ema20, ema50, ema200, rsi, macd, price, tf }) {
  if (!ema20 || !ema50 || !ema200 || !rsi || !macd || !macd.hist) {
    return {
      direction: "neutral",
      reason: `Not enough data to compute indicators on ${tf} timeframe yet.`
    };
  }

  const above200 = price > ema200;
  const below200 = price < ema200;
  const emaBull = ema20 > ema50;
  const emaBear = ema20 < ema50;

  const hist = macd.hist;
  const prevHist = macd.prevHist;

  const histUp = prevHist != null && hist > prevHist;
  const histDown = prevHist != null && hist < prevHist;

  let direction = "neutral";
  const lines = [];

  lines.push(`Timeframe: ${tf}`);
  lines.push(`Price: ${price.toFixed(4)}`);
  lines.push(
    `EMA20: ${ema20.toFixed(4)}, EMA50: ${ema50.toFixed(4)}, EMA200: ${ema200.toFixed(
      4
    )}`
  );
  lines.push(`RSI(14): ${rsi.toFixed(2)}`);
  if (macd.macd != null && macd.signal != null) {
    lines.push(
      `MACD: ${macd.macd.toFixed(4)}, Signal: ${macd.signal.toFixed(
        4
      )}, Hist: ${hist.toFixed(4)}`
    );
  }

  // LONG conditions
  if (above200 && emaBull && rsi > 50 && rsi < 70 && hist > 0 && histUp) {
    direction = "long";
    lines.push(
      "",
      "Why LONG:",
      "- Price is above EMA200: higher-timeframe uptrend.",
      "- EMA20 is above EMA50: short-term momentum is bullish.",
      "- RSI is between 50-70 and rising: healthy bullish momentum.",
      "- MACD histogram is positive and increasing: momentum is strengthening."
    );
  }
  // SHORT conditions
  else if (below200 && emaBear && rsi < 50 && rsi > 30 && hist < 0 && histDown) {
    direction = "short";
    lines.push(
      "",
      "Why SHORT:",
      "- Price is below EMA200: higher-timeframe downtrend.",
      "- EMA20 is below EMA50: short-term momentum is bearish.",
      "- RSI is between 30-50 and falling: bearish momentum.",
      "- MACD histogram is negative and decreasing: downside momentum is growing."
    );
  } else {
    direction = "neutral";
    lines.push(
      "",
      "Why NEUTRAL:",
      "- Conditions for a strong long/short setup are not fully aligned.",
      "- Trend and momentum are mixed or indecisive on this timeframe."
    );
  }

  return {
    direction,
    reason: lines.join("\n")
  };
}
