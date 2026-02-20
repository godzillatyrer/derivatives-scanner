import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const HEALTH_FILE = join(process.cwd(), 'data', 'worker-health.json');

export async function GET() {
  try {
    if (!existsSync(HEALTH_FILE)) {
      return Response.json({ status: 'offline', lastHeartbeat: null });
    }
    const data = JSON.parse(readFileSync(HEALTH_FILE, 'utf-8'));
    // Worker is "online" if heartbeat was within last 5 minutes
    const isOnline = data.lastHeartbeat && (Date.now() - data.lastHeartbeat) < 5 * 60 * 1000;
    return Response.json({
      ...data,
      status: isOnline ? data.status : 'offline',
      isOnline,
    });
  } catch (err) {
    return Response.json({ status: 'offline', error: err.message }, { status: 200 });
  }
}
