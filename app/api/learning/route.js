import { loadLearningState, saveLearningState } from '@/lib/learning';
import { DEFAULT_INDICATOR_WEIGHTS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await loadLearningState();
    return Response.json(state);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'reset') {
      const state = await loadLearningState();
      state.weights = { ...DEFAULT_INDICATOR_WEIGHTS };
      state.atrMultiplierSL = 1.5;
      state.rrMultiplier = 1.5;
      await saveLearningState(state);
      return Response.json({ success: true, state });
    }
    if (body.action === 'clear-history') {
      const state = await loadLearningState();
      state.history = [];
      state.stats = {
        totalSignals: 0, wins: 0, losses: 0, expired: 0,
        winRate: 0, avgProfit: 0, avgLoss: 0, profitFactor: 0,
        indicatorAccuracy: {}, coinPerformance: {},
      };
      await saveLearningState(state);
      return Response.json({ success: true, cleared: true });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
