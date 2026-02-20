import { fetchMeta, fetchAllMids } from '@/lib/hyperliquid';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [assets, mids] = await Promise.all([fetchMeta(), fetchAllMids()]);
    const coins = assets.map(a => ({
      ...a,
      price: mids[a.name] ? parseFloat(mids[a.name]) : null,
    }));
    return Response.json({ coins });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
