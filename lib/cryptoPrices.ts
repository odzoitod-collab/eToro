/**
 * Цены монет только из бесплатных API.
 * Кеширование в localStorage (цены в RUB) для показа при переходах и обновлении.
 */

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
    const res = await fetch(url, { signal: ac.signal });
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
    const [priceRes, rubRes] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`, { signal: ac.signal }),
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
 * Маппинг «некриптовых» тикеров (акции/сырьё) на тикеры Yahoo Finance.
 * Сейчас не используется — в маркете только крипто; оставлено на случай добавления акций/сырья позже.
 */
const TICKER_TO_YAHOO: Record<string, string> = {};

/** Время последней неудачной попытки Yahoo Finance (CORS/сеть). Не повторять чаще раза в 60 с. */
let lastYahooFailTs = 0;
const YAHOO_RETRY_COOLDOWN_MS = 60_000;

function isCorsOrNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message) {
    const m = err.message.toLowerCase();
    if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return true;
  }
  return false;
}

/**
 * Загружает цены для акций и сырья через Yahoo Finance в USD и конвертирует в RUB.
 * В браузере запросы к Yahoo Finance часто блокируются CORS — с клиента доступ только через серверный прокси (долгосрочное решение).
 * При CORS/сетевой ошибке возвращаем для тикеров unavailable: true, чтобы в UI показывать "—", а не устаревшие/нулевые данные.
 * Повторные запросы к Yahoo при ошибке — не чаще раза в 60 с на символ (избегаем лавины запросов).
 */
async function fetchNonCryptoPricesInRub(
  tickers: string[]
): Promise<Record<string, CoinPriceData>> {
  const upper = tickers.map((t) => t.toUpperCase());
  const yahooTickers = upper.filter((t) => TICKER_TO_YAHOO[t]);
  const yahooSymbols = [...new Set(yahooTickers.map((t) => TICKER_TO_YAHOO[t]))];

  if (yahooSymbols.length === 0) return {};

  if (lastYahooFailTs > 0 && Date.now() - lastYahooFailTs < YAHOO_RETRY_COOLDOWN_MS) {
    const unavailable: Record<string, CoinPriceData> = {};
    yahooTickers.forEach((t) => {
      unavailable[t] = { price: 0, change24h: 0, unavailable: true };
    });
    return unavailable;
  }

  try {
    let usdToRub = 100;
    try {
      const rubRes = await fetch(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json'
      );
      if (rubRes.ok) {
        const rubData = await rubRes.json();
        usdToRub = rubData?.usd?.rub ?? usdToRub;
      }
    } catch {
      // оставляем дефолтный курс
    }

    const symbolsParam = encodeURIComponent(yahooSymbols.join(','));
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsParam}`
    );
    if (!res.ok) {
      lastYahooFailTs = Date.now();
      const unavailable: Record<string, CoinPriceData> = {};
      yahooTickers.forEach((t) => {
        unavailable[t] = { price: 0, change24h: 0, unavailable: true };
      });
      return unavailable;
    }

    type YahooQuote = {
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketChangePercent?: number;
    };

    const data: {
      quoteResponse?: { result?: YahooQuote[] };
    } = await res.json();

    const result: Record<string, CoinPriceData> = {};
    const yahooToTicker: Record<string, string> = {};
    Object.entries(TICKER_TO_YAHOO).forEach(([ticker, sym]) => {
      yahooToTicker[sym] = ticker;
    });

    const list = data.quoteResponse?.result ?? [];
    for (const q of list) {
      if (!q.symbol || q.regularMarketPrice == null) continue;
      const ticker = yahooToTicker[q.symbol];
      if (!ticker) continue;
      const priceRub = q.regularMarketPrice * usdToRub;
      const change = q.regularMarketChangePercent ?? 0;
      result[ticker] = { price: priceRub, change24h: change };
    }

    return result;
  } catch (err) {
    if (isCorsOrNetworkError(err)) {
      lastYahooFailTs = Date.now();
    }
    const unavailable: Record<string, CoinPriceData> = {};
    yahooTickers.forEach((t) => {
      unavailable[t] = { price: 0, change24h: 0, unavailable: true };
    });
    return unavailable;
  }
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
