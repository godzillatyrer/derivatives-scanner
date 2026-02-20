import { loadState } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await loadState('signal-cache', null);
    if (!data) {
      return Response.json({ signals: [], coinData: {}, timestamp: null });
    }
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
