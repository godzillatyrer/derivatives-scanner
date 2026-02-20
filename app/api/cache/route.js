import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const CACHE_FILE = join(process.cwd(), 'data', 'signal-cache.json');

export async function GET() {
  try {
    if (!existsSync(CACHE_FILE)) {
      return Response.json({ signals: [], coinData: {}, timestamp: null });
    }
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
