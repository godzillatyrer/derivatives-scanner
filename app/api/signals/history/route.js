import { loadLearningState, resolveSignal } from '@/lib/learning';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = loadLearningState();
    const history = state.history.slice().reverse();
    return Response.json({
      signals: history,
      stats: state.stats,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { signalId, outcome, exitPrice } = await request.json();
    if (!signalId || !outcome) {
      return Response.json({ error: 'signalId and outcome required' }, { status: 400 });
    }
    const state = resolveSignal(signalId, outcome, exitPrice);
    return Response.json({ success: true, stats: state.stats });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
