/**
 * Цены монет только из бесплатных API.
 * Кеширование в localStorage (цены в RUB) для показа при переходах и обновлении.
 */

import { FOREX_TICKER_LIST } from '../constants';
import { fetchUsdRatesLive, fetchUsdRatesOnDate } from './currencyApi';

const CACHE_KEY = 'etoro_crypto_prices';
const CACHE_TTL_MS = 30 * 1000; // 30 секунд

export interface CachedPrices {
  prices: Record<string, { price: number; change24h: number }>;
  timestamp: number;
}

export function getCachedPrices(): Record<string, { price: number; change24h: number }> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: CachedPrices = JSON.parse(raw);
    if (!data?.prices || !data?.timestamp) return null;
    if (Date.now() - data.timestamp > CACHE_TTL_MS) return data.prices; // Возвращаем и устаревшие (для мгновенного показа)
    return data.prices;
  } catch {
    return null;
  }
}

function setCachedPrices(prices: Record<string, { price: number; change24h: number }>) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ prices, timestamp: Date.now() } satisfies CachedPrices)
    );
  } catch {}
}

/** Дописать в кеш цен (Forex + крипта), чтобы при возврате на маркет не мигали моки. */
function patchCachedPrices(patch: Record<string, CoinPriceData>) {
  const cur = getCachedPrices() ?? {};
  const next: Record<string, { price: number; change24h: number }> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v.unavailable) continue;
    next[k.toUpperCase()] = { price: v.price, change24h: v.change24h };
  }
  if (Object.keys(next).length > 0) setCachedPrices(next);
}

const FOREX_TICKER_SET = new Set(FOREX_TICKER_LIST.map((t) => t.toUpperCase()));

/**
 * В `usd` из currency-api: 1 USD = usd[ccy_lowercase] единиц валюты ccy.
 * Нужна середина пары BASE/QUOTE в виде «сколько QUOTE за 1 BASE».
 */
function unitsOfCcyPerOneUsd(usd: Record<string, number>, code: string): number | null {
  const k = code.toLowerCase();
  if (k === 'usd') return 1;
  const v = usd[k];
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (k === 'cnh') {
    const cnh = usd.cnh;
    if (typeof cnh === 'number' && cnh > 0) return cnh;
    const cny = usd.cny;
    if (typeof cny === 'number' && cny > 0) return cny;
  }
  return null;
}

function forexPairMid(ticker: string, usd: Record<string, number>): number | null {
  const t = ticker.toUpperCase();
  if (t.length !== 6) return null;
  const base = t.slice(0, 3);
  const quote = t.slice(3, 6);
  const rb = unitsOfCcyPerOneUsd(usd, base);
  const rq = unitsOfCcyPerOneUsd(usd, quote);
  if (rb == null || rq == null) return null;
  return rq / rb;
}

async function fetchUsdTablePriorDay(): Promise<Record<string, number> | null> {
  for (let back = 1; back <= 5; back++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - back);
    const iso = d.toISOString().slice(0, 10);
    const row = await fetchUsdRatesOnDate(iso);
    if (row?.usd && Object.keys(row.usd).length > 30) return row.usd;
  }
  return null;
}

let priorUsdCache: { usd: Record<string, number>; fetched: number } | null = null;
const PRIOR_USD_TTL_MS = 2 * 60 * 60 * 1000;

async function fetchUsdTablePriorDayCached(): Promise<Record<string, number> | null> {
  if (priorUsdCache && Date.now() - priorUsdCache.fetched < PRIOR_USD_TTL_MS) {
    return priorUsdCache.usd;
  }
  const usd = await fetchUsdTablePriorDay();
  if (usd) priorUsdCache = { usd, fetched: Date.now() };
  return usd;
}

/** Реальные котировки Forex из открытого API (как в CurrencyContext), без Yahoo/CORS-проблем. */
async function tryForexPricesInRub(tickers: string[]): Promise<Record<string, CoinPriceData>> {
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))].filter((t) => FOREX_TICKER_SET.has(t));
  if (upper.length === 0) return {};

  const [liveRates, priorUsd] = await Promise.all([
    fetchUsdRatesLive(),
    fetchUsdTablePriorDayCached(),
  ]);

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

/** Маппинг тикера приложения на id монеты в CoinGecko */
const TICKER_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  TON: 'the-open-network',
  USDT: 'tether',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  SHIB: 'shiba-inu',
  LTC: 'litecoin',
  TRX: 'tron',
  BCH: 'bitcoin-cash',
  NEAR: 'near',
  APT: 'aptos',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ARB: 'arbitrum',
  OP: 'optimism',
  INJ: 'injective-protocol',
  RNDR: 'render-token',
  PEPE: 'pepe',
  FIL: 'filecoin',
  HBAR: 'hedera-hashgraph',
  KAS: 'kaspa',
  VET: 'vechain',
  ICP: 'internet-computer',
  SUI: 'sui',
  SEI: 'sei-network',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  FLOKI: 'floki',
  STX: 'blockstack',
  TIA: 'celestia',
  IMX: 'immutable-x',
  FET: 'fetch-ai',
  RUNE: 'thorchain',
  AAVE: 'aave',
  MKR: 'maker',
  CRV: 'curve-dao-token',
  UNI: 'uniswap',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  AXS: 'axie-infinity',
  EGLD: 'multiversx',
  FTM: 'fantom',
  ALGO: 'algorand',
};

/** Маппинг тикера на пару Binance (USDT) — только крипта */
const TICKER_TO_BINANCE: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', TON: 'TONUSDT', USDT: 'USDTUSDT',
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

export interface CoinPriceData {
  price: number;
  change24h: number;
  /** true, если источник недоступен (например, CORS в браузере для Yahoo Finance). */
  unavailable?: boolean;
}

const FETCH_TIMEOUT_MS = 12_000;

/** Публичный CORS-прокси для обхода блокировки при запросе с другого origin (например, Vercel). */
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

async function fetchViaProxy(url: string, signal?: AbortSignal): Promise<Response> {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(url), { signal });
      if (res.ok) return res;
    } catch {
      // try next proxy
    }
  }
  throw new Error('All proxies failed');
}

async function fetchWithCorsFallback(url: string, signal?: AbortSignal): Promise<Response> {
  try {
    const res = await fetch(url, { signal });
    if (res.ok) return res;
    throw new Error('Not OK');
  } catch (e) {
    return fetchViaProxy(url, signal);
  }
}

/**
 * Для некоторых публичных API (CoinGecko) прямой fetch в браузере часто падает/логирует ошибку в консоль.
 * Чтобы не засорять консоль и сеть, можно сразу идти через прокси.
 */
async function fetchViaProxyFirst(url: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetchViaProxy(url, signal);
  } catch {
    // fallback: вдруг все прокси недоступны, попробуем напрямую
    const res = await fetch(url, { signal });
    return res;
  }
}

/**
 * Загружает цены и изменение за 24ч в рублях по списку тикеров.
 * Сначала пробуем CoinGecko (CORS в браузере обычно разрешён), затем Binance.
 * Таймаут запроса — не блокирует UI при лагах сети.
 */
export async function fetchCryptoPricesInRub(
  tickers: string[]
): Promise<Record<string, CoinPriceData>> {
  // 1. CoinGecko первым — в браузере реже блокируется CORS, чем Binance
  const cg = await tryCoinGecko(tickers);
  if (Object.keys(cg).length > 0) {
    setCachedPrices(cg);
    return cg;
  }

  // 2. Binance (может падать из-за CORS или блокировки по региону)
  const bin = await tryBinance(tickers);
  if (Object.keys(bin).length > 0) {
    setCachedPrices(bin);
    return bin;
  }

  return {};
}

async function tryCoinGecko(tickers: string[]): Promise<Record<string, CoinPriceData>> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const ids = tickers.map((t) => TICKER_TO_COINGECKO_ID[t.toUpperCase()]).filter(Boolean);
    if (ids.length === 0) return {};
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.slice(0, 30).join(',')}&vs_currencies=rub&include_24hr_change=true`;
    // proxy-first: убирает "Fetch failed loading" в консоли, если прямой запрос блокируется
    const res = await fetchViaProxyFirst(url, ac.signal);
    clearTimeout(timeoutId);
    if (!res.ok) return {};
    const data: Record<string, { rub?: number; rub_24h_change?: number }> = await res.json();
    const out: Record<string, CoinPriceData> = {};
    for (const [id, row] of Object.entries(data)) {
      if (!row || row.rub == null) continue;
      const ticker = COINGECKO_ID_TO_TICKER[id];
      if (!ticker) continue;
      out[ticker] = { price: row.rub, change24h: row.rub_24h_change ?? 0 };
    }
    return out;
  } catch {
    clearTimeout(timeoutId);
    return {};
  }
}

async function tryBinance(tickers: string[]): Promise<Record<string, CoinPriceData>> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const symbols = tickers.map((t) => TICKER_TO_BINANCE[t.toUpperCase()]).filter(Boolean);
    if (symbols.length === 0) return {};
    const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
    const priceUrl = `https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`;
    const [priceRes, rubRes] = await Promise.all([
      // proxy-first: прямой запрос к Binance часто даёт CORS/blocked и логирует ошибку в консоль
      fetchViaProxyFirst(priceUrl, ac.signal),
      fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json', { signal: ac.signal }),
    ]);
    clearTimeout(timeoutId);
    if (!priceRes.ok) return {};
    const rubData = rubRes.ok ? await rubRes.json() : { usd: { rub: 100 } };
    const usdToRub = rubData?.usd?.rub ?? 100;
    const priceList: { symbol: string; price: string }[] = await priceRes.json();
    const list = Array.isArray(priceList) ? priceList : [priceList];
    const binanceToTicker: Record<string, string> = {};
    Object.entries(TICKER_TO_BINANCE).forEach(([ticker, sym]) => { binanceToTicker[sym] = ticker; });
    const out: Record<string, CoinPriceData> = {};
    for (const { symbol: sym, price } of list) {
      const ticker = binanceToTicker[sym];
      if (ticker && price) out[ticker] = { price: parseFloat(price) * usdToRub, change24h: 0 };
    }
    return out;
  } catch {
    clearTimeout(timeoutId);
    return {};
  }
}

/**
 * Некрипта (сейчас только Forex): реальные кросс-курсы из currency-api, день к дню ≈24h change.
 * Акции/сырьё — при необходимости отдельный провайдер.
 */
async function fetchNonCryptoPricesInRub(tickers: string[]): Promise<Record<string, CoinPriceData>> {
  return tryForexPricesInRub(tickers);
}

/**
 * Универсальный загрузчик цен в RUB для всех активов.
 * Не бросает исключения — при ошибках возвращает частичный результат или {}.
 */
export async function fetchAssetPricesInRub(
  tickers: string[]
): Promise<Record<string, CoinPriceData>> {
  if (!tickers.length) return {};
  try {
    const upper = tickers.map((t) => t.toUpperCase());
    const cryptoTickers = upper.filter(
      (t) => TICKER_TO_BINANCE[t] || TICKER_TO_COINGECKO_ID[t]
    );
    const otherTickers = upper.filter(
      (t) => !TICKER_TO_BINANCE[t] && !TICKER_TO_COINGECKO_ID[t]
    );

    const [cryptoPrices, otherPrices] = await Promise.all([
      cryptoTickers.length ? fetchCryptoPricesInRub(cryptoTickers) : Promise.resolve({}),
      otherTickers.length ? fetchNonCryptoPricesInRub(otherTickers) : Promise.resolve({}),
    ]);

    return { ...cryptoPrices, ...otherPrices };
  } catch {
    return {};
  }
}

/** Обратный маппинг: coingecko id -> ticker (для разбора ответа по id) */
const COINGECKO_ID_TO_TICKER: Record<string, string> = {};
Object.entries(TICKER_TO_COINGECKO_ID).forEach(([ticker, id]) => {
  COINGECKO_ID_TO_TICKER[id] = ticker;
});

export function getCoinGeckoId(ticker: string): string | undefined {
  return TICKER_TO_COINGECKO_ID[ticker.toUpperCase()];
}
