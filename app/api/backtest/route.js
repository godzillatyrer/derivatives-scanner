import { fetchCandles } from '@/lib/hyperliquid';
import { runBacktest, optimizeParameters } from '@/lib/backtester';
import { TIMEFRAME_MS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      coin = 'BTC',
      timeframe = '4h',
      days = 30,
      mode = 'single', // 'single' or 'optimize'
      minConfidence = 40,
      atrMultiplierSL = 1.5,
      rrMultiplier = 1.5,
      maxHoldBars = 12,
      leverage = 3,
    } = body;

    // Fetch historical candles
    const tfMs = TIMEFRAME_MS[timeframe] || 4 * 60 * 60 * 1000;
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const candles = await fetchCandles(coin, timeframe, startTime);

    if (!candles || candles.length < 210) {
      return Response.json(
        { error: `Not enough data: got ${candles?.length || 0} candles, need 210+` },
        { status: 400 }
      );
    }

    if (mode === 'optimize') {
      const results = optimizeParameters({
        candles,
        timeframe,
        confidenceRange: [30, 40, 50, 60],
        atrSlRange: [1.0, 1.5, 2.0],
        rrRange: [1.0, 1.5, 2.0, 2.5],
        maxHoldBarsRange: [Math.round((48 * 60 * 60 * 1000) / tfMs)],
      });

      return Response.json({
        coin,
        timeframe,
        days,
        totalCandles: candles.length,
        mode: 'optimize',
        results,
      });
    }

    // Single backtest
    const result = runBacktest({
      candles,
      timeframe,
      minConfidence,
      atrMultiplierSL,
      rrMultiplier,
      maxHoldBars,
      leverage,
    });

    return Response.json({
      coin,
      timeframe,
      days,
      totalCandles: candles.length,
      mode: 'single',
      ...result,
    });
  } catch (err) {
    console.error('Backtest error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
