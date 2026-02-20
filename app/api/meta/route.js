import { fetchMetaAndAssetCtxs, fetchAllMids } from '@/lib/hyperliquid';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [assets, mids] = await Promise.all([fetchMetaAndAssetCtxs(), fetchAllMids()]);
    const coins = assets.map(a => ({
      ...a,
      price: mids[a.name] ? parseFloat(mids[a.name]) : null,
      // market cap approximation: OI * mark price (notional open interest value)
      marketCap: a.openInterest && a.markPx ? a.openInterest * a.markPx : null,
    }));
    return Response.json({ coins });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
