import { loadState } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [configs, status] = await Promise.all([
      loadState('coin-configs', () => ({})),
      loadState('calibration-status', () => null),
    ]);

    const coins = Object.entries(configs)
      .filter(([, v]) => v.calibratedAt)
      .map(([coin, cfg]) => ({
        coin,
        minConfidence: cfg.minConfidence,
        atrMultiplierSL: cfg.atrMultiplierSL,
        rrMultiplier: cfg.rrMultiplier,
        maxHoldBars: cfg.maxHoldBars,
        ...cfg.backtestStats,
        calibratedAt: cfg.calibratedAt,
      }))
      .sort((a, b) => (b.returnPct || 0) - (a.returnPct || 0));

    return Response.json({
      configs: coins,
      totalCalibrated: coins.length,
      lastRun: status?.lastRun || null,
      lastDuration: status?.duration || null,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
