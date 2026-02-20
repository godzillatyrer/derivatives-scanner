import { loadLearningState, saveLearningState } from '@/lib/learning';
import { DEFAULT_INDICATOR_WEIGHTS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = loadLearningState();
    return Response.json(state);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'reset') {
      const state = loadLearningState();
      state.weights = { ...DEFAULT_INDICATOR_WEIGHTS };
      state.atrMultiplierSL = 1.5;
      state.rrMultiplier = 1.5;
      saveLearningState(state);
      return Response.json({ success: true, state });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
