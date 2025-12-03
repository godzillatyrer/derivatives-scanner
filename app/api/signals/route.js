import { NextResponse } from "next/server";
import { fetchFuturesTickers, fetchKlines } from "@/lib/binance";
import { calcEMA, calcRSI, calcMACD, generateSignal } from "@/lib/indicators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tickers = await fetchFuturesTickers();

    // Filter USDT perpetuals only and sort by quoteVolume (descending)
    const usdtPerps = tickers
      .filter((t) => t.symbol.endsWith("USDT"))
      .map((t) => ({
        symbol: t.symbol,
        lastPrice: parseFloat(t.lastPrice),
        priceChangePercent: parseFloat(t.priceChangePercent),
        volume: parseFloat(t.quoteVolume || t.volume || 0)
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 30); // top 30 by volume

    const results = [];

    // Fetch klines & compute indicators for each symbol
    await Promise.all(
      usdtPerps.map(async (item) => {
        try {
          const [k4h, k1d] = await Promise.all([
            fetchKlines(item.symbol, "4h", 200),
            fetchKlines(item.symbol, "1d", 200)
          ]);

          const price = item.lastPrice;

          // 4H indicators
          const ema20_4h = calcEMA(k4h.closes, 20);
          const ema50_4h = calcEMA(k4h.closes, 50);
          const ema200_4h = calcEMA(k4h.closes, 200);
          const rsi4h = calcRSI(k4h.closes, 14);
          const macd4h = calcMACD(k4h.closes);

          const sig4h = generateSignal({
            closes: k4h.closes,
            ema20: ema20_4h,
            ema50: ema50_4h,
            ema200: ema200_4h,
            rsi: rsi4h,
            macd: macd4h,
            price,
            tf: "4H"
          });

          // 1D indicators
          const ema20_1d = calcEMA(k1d.closes, 20);
          const ema50_1d = calcEMA(k1d.closes, 50);
          const ema200_1d = calcEMA(k1d.closes, 200);
          const rsi1d = calcRSI(k1d.closes, 14);
          const macd1d = calcMACD(k1d.closes);

          const sig1d = generateSignal({
            closes: k1d.closes,
            ema20: ema20_1d,
            ema50: ema50_1d,
            ema200: ema200_1d,
            rsi: rsi1d,
            macd: macd1d,
            price,
            tf: "1D"
          });

          results.push({
            ...item,
            signals: {
              "4h": sig4h,
              "1d": sig1d
            }
          });
        } catch (e) {
          console.error("Error computing signals for", item.symbol, e);
        }
      })
    );

    // ensure results are always sorted by volume (highest first)
    results.sort((a, b) => b.volume - a.volume);

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      count: results.length,
      symbols: results
    });
  } catch (error) {
    console.error("API /signals error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch signals",
        details: String(error?.message || error)
      },
      { status: 500 }
    );
  }
}
