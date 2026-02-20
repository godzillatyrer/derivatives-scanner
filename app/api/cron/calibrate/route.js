/**
 * Auto-calibration cron.
 * Runs every 6 hours. For each top coin, backtests multiple parameter
 * combos on recent history and stores the best config per coin in Redis.
 * The scan cron then uses these per-coin configs for paper trading.
 */

import { fetchMetaAndAssetCtxs, fetchAllMids, fetchCandles } from '@/lib/hyperliquid';
import { optimizeParameters } from '@/lib/backtester';
import { loadState, saveState } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CONFIGS_KEY = 'coin-configs';
const CALIBRATION_KEY = 'calibration-status';
const TOP_N = 20;         // calibrate top 20 coins by volume
const HISTORY_DAYS = 60;  // 60 days of history per coin
const TIMEFRAME = '4h';   // primary trading timeframe
const BATCH_SIZE = 2;     // process 2 coins at a time (Vercel CPU limits)

// Fallback config if no backtest data or results are bad
const DEFAULT_CONFIG = {
  minConfidence: 40,
  atrMultiplierSL: 1.5,
  rrMultiplier: 1.5,
  maxHoldBars: 12,
};

// Minimum quality bar — don't use a config worse than this
const MIN_PROFIT_FACTOR = 0.8;
const MIN_TRADES = 5;

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Get top coins by volume
    const [assets, mids] = await Promise.all([fetchMetaAndAssetCtxs(), fetchAllMids()]);
    const coinsWithVolume = assets
      .filter(a => mids[a.name])
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
      .slice(0, TOP_N)
      .map(a => a.name);

    // Load existing configs
    const existing = await loadState(CONFIGS_KEY, () => ({}));
    const configs = { ...existing };
    const results = [];
    let calibrated = 0;
    let skipped = 0;

    // Process coins in small batches
    for (let i = 0; i < coinsWithVolume.length; i += BATCH_SIZE) {
      // Check time budget — leave 5s for saving
      if (Date.now() - startTime > 50000) {
        skipped += coinsWithVolume.length - i;
        break;
      }

      const batch = coinsWithVolume.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (coin) => {
        try {
          const candleStart = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
          const candles = await fetchCandles(coin, TIMEFRAME, candleStart);

          if (!candles || candles.length < 210) {
            return { coin, status: 'insufficient_data', candles: candles?.length || 0 };
          }

          // Max hold bars for 48h at chosen timeframe
          const tfMs = 4 * 60 * 60 * 1000;
          const maxHoldBars = Math.round((48 * 60 * 60 * 1000) / tfMs);

          const optimized = optimizeParameters({
            candles,
            timeframe: TIMEFRAME,
            confidenceRange: [30, 40, 50, 60],
            atrSlRange: [1.0, 1.5, 2.0],
            rrRange: [1.0, 1.5, 2.0, 2.5],
            maxHoldBarsRange: [maxHoldBars],
          });

          if (optimized.length === 0) {
            return { coin, status: 'no_valid_configs' };
          }

          const best = optimized[0];

          // Quality gate — only use if the backtest is good enough
          if (best.totalTrades < MIN_TRADES || best.profitFactor < MIN_PROFIT_FACTOR) {
            return {
              coin,
              status: 'below_quality_bar',
              best: { ...best.params, trades: best.totalTrades, pf: best.profitFactor },
            };
          }

          configs[coin] = {
            ...best.params,
            // Store performance stats for the UI
            backtestStats: {
              winRate: best.winRate,
              profitFactor: best.profitFactor,
              returnPct: best.returnPct,
              totalTrades: best.totalTrades,
              sharpe: best.sharpe,
              maxDrawdown: best.maxDrawdown,
            },
            calibratedAt: Date.now(),
            candleCount: candles.length,
          };

          calibrated++;
          return {
            coin,
            status: 'calibrated',
            params: best.params,
            winRate: best.winRate,
            returnPct: best.returnPct,
            profitFactor: best.profitFactor,
            trades: best.totalTrades,
          };
        } catch (err) {
          return { coin, status: 'error', error: err.message };
        }
      }));

      results.push(...batchResults);
    }

    // Save configs and status
    await Promise.all([
      saveState(CONFIGS_KEY, configs),
      saveState(CALIBRATION_KEY, {
        lastRun: Date.now(),
        duration: Date.now() - startTime,
        coinsCalibrated: calibrated,
        coinsSkipped: skipped,
        totalConfigs: Object.keys(configs).length,
        results,
      }),
    ]);

    return Response.json({
      ok: true,
      calibrated,
      skipped,
      totalConfigs: Object.keys(configs).length,
      durationMs: Date.now() - startTime,
      results,
    });
  } catch (err) {
    console.error('Calibration error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
