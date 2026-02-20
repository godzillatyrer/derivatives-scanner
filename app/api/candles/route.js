import { fetchRecentCandles } from '@/lib/hyperliquid';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const coin = searchParams.get('coin');
  const interval = searchParams.get('interval') || '4h';
  const count = parseInt(searchParams.get('count') || '300', 10);

  if (!coin) {
    return Response.json({ error: 'coin parameter required' }, { status: 400 });
  }

  try {
    const candles = await fetchRecentCandles(coin, interval, count);
    return Response.json({ candles });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
