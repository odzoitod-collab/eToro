/**
 * Vercel Serverless Function — /api/prices
 * Запрашивает Binance с сервера (нет CORS), кешируется на CDN 10 минут.
 * GET /api/prices?symbols=BTCUSDT,ETHUSDT,...
 */

export const config = { runtime: 'edge' };

const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/24hr';
const USD_RUB_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get('symbols') ?? '';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 's-maxage=600, stale-while-revalidate=60',
  };

  if (!symbolsParam) {
    return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400, headers: corsHeaders });
  }

  const symbols = symbolsParam.split(',').filter(Boolean);

  try {
    const [binanceRes, rubRes] = await Promise.all([
      fetch(`${BINANCE_URL}?symbols=${encodeURIComponent(JSON.stringify(symbols))}&type=MINI`),
      fetch(USD_RUB_URL),
    ]);

    if (!binanceRes.ok) {
      return new Response(JSON.stringify({ error: 'binance error', status: binanceRes.status }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    const [binanceData, rubData] = await Promise.all([
      binanceRes.json(),
      rubRes.ok ? rubRes.json() : Promise.resolve({ usd: { rub: 90 } }),
    ]);

    const usdToRub: number = rubData?.usd?.rub ?? 90;

    const result: Record<string, { price: number; change24h: number }> = {};
    for (const item of binanceData as { symbol: string; lastPrice: string; priceChangePercent: string }[]) {
      const priceUsd = parseFloat(item.lastPrice);
      const change24h = parseFloat(item.priceChangePercent);
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
      result[item.symbol] = { price: priceUsd * usdToRub, change24h: change24h ?? 0 };
    }

    return new Response(JSON.stringify({ usdToRub, prices: result }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
}
