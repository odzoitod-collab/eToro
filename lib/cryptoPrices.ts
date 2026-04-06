/**
 * Цены монет через собственный Vercel Edge API (/api/prices).
 * Сервер запрашивает Binance — нет CORS, нет прокси, нет блокировок.
 * Vercel CDN кеширует ответ 10 минут — первый запрос быстрый, остальные мгновенные.
 * localStorage кеш — мгновенный показ при открытии без единого запроса.
 */

import { FOREX_TICKER_LIST } from '../constants';
import { fetchUsdRatesLive, fetchUsdRatesOnDate } from './currencyApi';

const CACHE_KEY = 'etoro_crypto_prices_v2';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут

export interface CachedPrices {
  prices: Record<string, { price: number; change24h: number }>;
  timestamp: number;
}

export function getCachedPrices(): Record<string, { price: number; change24h: number }> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: CachedPrices = JSON.parse(raw);
    if (!data?.prices) return null;
    return data.prices;
  } catch {
    return null;
  }
}

export function isCacheExpired(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return true;
    const data: CachedPrices = JSON.parse(raw);
    return Date.now() - data.timestamp > CACHE_TTL_MS;
  } catch {
    return true;
  }
}

function setCachedPrices(prices: Record<string, { price: number; change24h: number }>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ prices, timestamp: Date.now() } satisfies CachedPrices));
  } catch {}
}

function patchCachedPrices(patch: Record<string, CoinPriceData>) {
  const cur = getCachedPrices() ?? {};
  const next: Record<string, { price: number; change24h: number }> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v.unavailable) continue;
    next[k.toUpperCase()] = { price: v.price, change24h: v.change24h };
  }
  if (Object.keys(next).length > 0) setCachedPrices(next);
}

// ─── Forex ────────────────────────────────────────────────────────────────────

const FOREX_TICKER_SET = new Set(FOREX_TICKER_LIST.map((t) => t.toUpperCase()));

function unitsOfCcyPerOneUsd(usd: Record<string, number>, code: string): number | null {
  const k = code.toLowerCase();
  if (k === 'usd') return 1;
  const v = usd[k];
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (k === 'cnh') {
    const cnh = usd.cnh ?? usd.cny;
    if (typeof cnh === 'number' && cnh > 0) return cnh;
  }
  return null;
}

function forexPairMid(ticker: string, usd: Record<string, number>): number | null {
  const t = ticker.toUpperCase();
  if (t.length !== 6) return null;
  const rb = unitsOfCcyPerOneUsd(usd, t.slice(0, 3));
  const rq = unitsOfCcyPerOneUsd(usd, t.slice(3, 6));
  if (rb == null || rq == null) return null;
  return rq / rb;
}

async function fetchUsdTablePriorDay(): Promise<Record<string, number> | null> {
  for (let back = 1; back <= 5; back++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - back);
    const row = await fetchUsdRatesOnDate(d.toISOString().slice(0, 10));
    if (row?.usd && Object.keys(row.usd).length > 30) return row.usd;
  }
  return null;
}

let priorUsdCache: { usd: Record<string, number>; fetched: number } | null = null;

async function fetchUsdTablePriorDayCached(): Promise<Record<string, number> | null> {
  if (priorUsdCache && Date.now() - priorUsdCache.fetched < 2 * 60 * 60 * 1000) return priorUsdCache.usd;
  const usd = await fetchUsdTablePriorDay();
  if (usd) priorUsdCache = { usd, fetched: Date.now() };
  return usd;
}

async function tryForexPricesInRub(tickers: string[]): Promise<Record<string, CoinPriceData>> {
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))].filter((t) => FOREX_TICKER_SET.has(t));
  if (upper.length === 0) return {};

  const [liveRates, priorUsd] = await Promise.all([fetchUsdRatesLive(), fetchUsdTablePriorDayCached()]);
  const usd = liveRates?.usd;
  if (!usd || typeof usd.rub !== 'number' || usd.rub <= 0) return {};

  const usdToRub = usd.rub;
  const out: Record<string, CoinPriceData> = {};
  for (const t of upper) {
    const spot = forexPairMid(t, usd);
    if (spot == null || !Number.isFinite(spot) || spot <= 0) continue;
    const priceRub = spot * usdToRub;
    let change24h = 0;
    if (priorUsd) {
      const prev = forexPairMid(t, priorUsd);
      if (prev != null && prev > 0) change24h = ((spot - prev) / prev) * 100;
    }
    out[t] = { price: priceRub, change24h };
  }
  if (Object.keys(out).length > 0) patchCachedPrices(out);
  return out;
}

// ─── Маппинг тикер → Binance symbol ──────────────────────────────────────────

const TICKER_TO_BINANCE: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', TON: 'TONUSDT',
  XRP: 'XRPUSDT', DOGE: 'DOGEUSDT', ADA: 'ADAUSDT', AVAX: 'AVAXUSDT', DOT: 'DOTUSDT',
  LINK: 'LINKUSDT', MATIC: 'MATICUSDT', SHIB: 'SHIBUSDT', LTC: 'LTCUSDT', TRX: 'TRXUSDT',
  BCH: 'BCHUSDT', NEAR: 'NEARUSDT', APT: 'APTUSDT', ATOM: 'ATOMUSDT', XLM: 'XLMUSDT',
  ARB: 'ARBUSDT', OP: 'OPUSDT', INJ: 'INJUSDT', RNDR: 'RNDRUSDT', PEPE: 'PEPEUSDT',
  FIL: 'FILUSDT', HBAR: 'HBARUSDT', KAS: 'KASUSDT', VET: 'VETUSDT', ICP: 'ICPUSDT',
  SUI: 'SUIUSDT', SEI: 'SEIUSDT', WIF: 'WIFUSDT', BONK: 'BONKUSDT', FLOKI: 'FLOKIUSDT',
  STX: 'STXUSDT', TIA: 'TIAUSDT', IMX: 'IMXUSDT', FET: 'FETUSDT', RUNE: 'RUNEUSDT',
  AAVE: 'AAVEUSDT', MKR: 'MKRUSDT', CRV: 'CRVUSDT', UNI: 'UNIUSDT', SAND: 'SANDUSDT',
  MANA: 'MANAUSDT', AXS: 'AXSUSDT', EGLD: 'EGLDUSDT', FTM: 'FTMUSDT', ALGO: 'ALGOUSDT',
};

const BINANCE_TO_TICKER: Record<string, string> = Object.fromEntries(
  Object.entries(TICKER_TO_BINANCE).map(([t, s]) => [s, t])
);

const STABLE_USD: Record<string, number> = { USDT: 1 };

export interface CoinPriceData {
  price: number;
  change24h: number;
  unavailable?: boolean;
}

// ─── Запрос к /api/prices (Vercel Edge, кеш CDN 10 мин) ──────────────────────

async function fetchFromOwnApi(
  symbols: string[],
): Promise<Record<string, CoinPriceData>> {
  if (symbols.length === 0) return {};

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 8_000);

  try {
    const res = await fetch(`/api/prices?symbols=${symbols.join(',')}`, {
      signal: ac.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return {};

    const data: { usdToRub: number; prices: Record<string, { price: number; change24h: number }> } = await res.json();
    const out: Record<string, CoinPriceData> = {};

    for (const [sym, val] of Object.entries(data.prices)) {
      const ticker = BINANCE_TO_TICKER[sym];
      if (ticker) out[ticker] = val;
    }
    return out;
  } catch {
    clearTimeout(tid);
    return {};
  }
}

// ─── Публичный API ────────────────────────────────────────────────────────────

export async function fetchCryptoPricesInRub(
  tickers: string[]
): Promise<Record<string, CoinPriceData>> {
  const upper = tickers.map((t) => t.toUpperCase());

  // Стейблкоины — мгновенно из кеша курса
  const stableOut: Record<string, CoinPriceData> = {};
  const cryptoTickers: string[] = [];

  for (const t of upper) {
    if (STABLE_USD[t] != null) {
      // Курс возьмём из кеша или дефолт
      const cached = getCachedPrices();
      const cachedRate = cached?.[t]?.price;
      stableOut[t] = { price: cachedRate ?? 90, change24h: 0 };
    } else if (TICKER_TO_BINANCE[t]) {
      cryptoTickers.push(TICKER_TO_BINANCE[t]);
    }
  }

  const result = await fetchFromOwnApi(cryptoTickers);

  // Добавляем стейблы
  Object.assign(result, stableOut);

  if (Object.keys(result).length > 0) setCachedPrices(result);
  return result;
}

export async function fetchAssetPricesInRub(
  tickers: string[]
): Promise<Record<string, CoinPriceData>> {
  if (!tickers.length) return {};
  try {
    const upper = tickers.map((t) => t.toUpperCase());
    const cryptoTickers = upper.filter((t) => TICKER_TO_BINANCE[t] || STABLE_USD[t] != null);
    const otherTickers = upper.filter((t) => !TICKER_TO_BINANCE[t] && STABLE_USD[t] == null);

    const [cryptoPrices, otherPrices] = await Promise.all([
      cryptoTickers.length ? fetchCryptoPricesInRub(cryptoTickers) : Promise.resolve({}),
      otherTickers.length ? tryForexPricesInRub(otherTickers) : Promise.resolve({}),
    ]);

    return { ...cryptoPrices, ...otherPrices };
  } catch {
    return {};
  }
}

export function getCoinGeckoId(_ticker: string): string | undefined {
  return undefined;
}
