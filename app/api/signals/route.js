import { fetchMetaAndAssetCtxs, fetchAllMids, fetchRecentCandles } from '@/lib/hyperliquid';
import { generateSignal, calculateTPSL } from '@/lib/signals';
import { loadLearningState, recordSignal, checkSignalOutcomes } from '@/lib/learning';
import { loadState } from '@/lib/storage';
import { TIMEFRAMES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'signal-cache';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const coinFilter = searchParams.get('coin');
  const limit = parseInt(searchParams.get('limit') || '30', 10);

  // Try to return cached signals if recent (< 3 min old)
  if (!coinFilter) {
    try {
      const cached = await loadState(CACHE_KEY, null);
      if (cached?.signals?.length > 0 && cached.timestamp && Date.now() - cached.timestamp < 3 * 60 * 1000) {
        const learningState = await loadLearningState();
        return Response.json({
          signals: cached.signals.slice(0, limit),
          meta: {
            totalCoins: cached.signals.length,
            signalCount: cached.signals.length,
            longCount: cached.signals.filter(s => s.direction?.includes('LONG')).length,
            shortCount: cached.signals.filter(s => s.direction?.includes('SHORT')).length,
            neutralCount: cached.signals.filter(s => s.direction === 'NEUTRAL').length,
            learningStats: learningState.stats,
            cached: true,
          },
        });
      }
    } catch {
      // Fall through to generate fresh signals
    }
  }

  try {
    const learningState = await loadLearningState();
    const [assets, mids] = await Promise.all([fetchMetaAndAssetCtxs(), fetchAllMids()]);

    const currentPrices = {};
    for (const a of assets) {
      if (mids[a.name]) currentPrices[a.name] = parseFloat(mids[a.name]);
    }
    await checkSignalOutcomes(learningState, currentPrices);

    let coinsToScan = assets.filter(a => mids[a.name]);
    if (coinFilter) {
      coinsToScan = coinsToScan.filter(a => a.name === coinFilter);
    } else {
      coinsToScan = coinsToScan.slice(0, limit);
    }

    const signals = [];
    const batchSize = 5;

    for (let i = 0; i < coinsToScan.length; i += batchSize) {
      const batch = coinsToScan.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (coin) => {
          try {
            const tfData = {};
            const candleResults = await Promise.all(
              TIMEFRAMES.map(async (tf) => {
                try {
                  const candles = await fetchRecentCandles(coin.name, tf, 300);
                  return { tf, candles };
                } catch {
                  return { tf, candles: [] };
                }
              })
            );

            for (const { tf, candles } of candleResults) {
              if (candles.length >= 52) tfData[tf] = candles;
            }

            if (Object.keys(tfData).length === 0) return null;

            const signal = generateSignal(tfData, learningState.weights);
            if (!signal) return null;

            const tpslCandles = tfData['4h'] || tfData['1h'] || Object.values(tfData)[0];
            const tpsl = calculateTPSL(signal, tpslCandles, learningState);

            const result = {
              coin: coin.name,
              price: currentPrices[coin.name],
              ...signal,
              ...tpsl,
            };

            if (signal.direction !== 'NEUTRAL' && signal.confidence >= 40) {
              await recordSignal({
                coin: coin.name,
                direction: signal.direction,
                confidence: signal.confidence,
                entry: tpsl?.entry,
                stopLoss: tpsl?.stopLoss,
                takeProfits: tpsl?.takeProfits,
                indicatorScores: signal.timeframeResults?.['4h']?.indicators || {},
              });
            }

            return result;
          } catch (err) {
            console.error(`Error processing ${coin.name}:`, err.message);
            return null;
          }
        })
      );

      signals.push(...batchResults.filter(Boolean));
    }

    signals.sort((a, b) => b.confidence - a.confidence);

    return Response.json({
      signals,
      meta: {
        totalCoins: coinsToScan.length,
        signalCount: signals.length,
        longCount: signals.filter(s => s.direction?.includes('LONG')).length,
        shortCount: signals.filter(s => s.direction?.includes('SHORT')).length,
        neutralCount: signals.filter(s => s.direction === 'NEUTRAL').length,
        learningStats: learningState.stats,
      },
    });
  } catch (err) {
    console.error('Signal generation error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
