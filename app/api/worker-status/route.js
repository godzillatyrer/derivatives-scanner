import { loadState } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await loadState('worker-health', null);
    if (!data) {
      return Response.json({ status: 'offline', lastHeartbeat: null, isOnline: false });
    }
    const isOnline = data.lastHeartbeat && (Date.now() - data.lastHeartbeat) < 5 * 60 * 1000;
    return Response.json({
      ...data,
      status: isOnline ? data.status : 'offline',
      isOnline,
    });
  } catch (err) {
    return Response.json({ status: 'offline', error: err.message, isOnline: false });
  }
}
