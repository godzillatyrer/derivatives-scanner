import {
  calcATR,
  calcBollinger,
  calcEMA,
  calcMACD,
  calcRSI,
  calcStochastic,
  generateSignal
} from "@/lib/indicators";

export function computeSignalFromCandles({ candles, price, tf, tuning }) {
  return generateSignal({
    tf,
    tuning,
    price,
    ema20: calcEMA(candles.closes, 20),
    ema50: calcEMA(candles.closes, 50),
    ema200: calcEMA(candles.closes, 200),
    rsi: calcRSI(candles.closes, 14),
    macd: calcMACD(candles.closes),
    atr: calcATR(candles.highs, candles.lows, candles.closes, 14),
    stoch: calcStochastic(candles.highs, candles.lows, candles.closes, 14),
    bollinger: calcBollinger(candles.closes, 20, 2)
  });
}

export function pickPrimarySignal(signal4h, signal1d) {
  return Math.abs(signal4h.score) >= Math.abs(signal1d.score) ? signal4h : signal1d;
}
