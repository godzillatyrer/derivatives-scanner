import { fetchMeta, fetchAllMids, fetchRecentCandles } from '@/lib/hyperliquid';
import { generateSignal, calculateTPSL } from '@/lib/signals';
import { loadLearningState, recordSignal, checkSignalOutcomes } from '@/lib/learning';
import { TIMEFRAMES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const coinFilter = searchParams.get('coin');
  const limit = parseInt(searchParams.get('limit') || '30', 10);

  try {
    const learningState = loadLearningState();
    const [assets, mids] = await Promise.all([fetchMeta(), fetchAllMids()]);

    // Check existing signal outcomes
    const currentPrices = {};
    for (const a of assets) {
      if (mids[a.name]) currentPrices[a.name] = parseFloat(mids[a.name]);
    }
    checkSignalOutcomes(learningState, currentPrices);

    // Determine which coins to scan
    let coinsToScan = assets.filter(a => mids[a.name]);
    if (coinFilter) {
      coinsToScan = coinsToScan.filter(a => a.name === coinFilter);
    } else {
      coinsToScan = coinsToScan.slice(0, limit);
    }

    // Fetch candles for all timeframes in parallel
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

            // Use 4h candles for TP/SL, fallback to 1h
            const tpslCandles = tfData['4h'] || tfData['1h'] || Object.values(tfData)[0];
            const tpsl = calculateTPSL(signal, tpslCandles, learningState);

            const result = {
              coin: coin.name,
              price: currentPrices[coin.name],
              ...signal,
              ...tpsl,
            };

            // Record signal for tracking
            if (signal.direction !== 'NEUTRAL') {
              recordSignal({
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

    // Sort by confidence descending
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
