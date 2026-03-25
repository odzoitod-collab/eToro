/**
 * fawazahmed0/currency-api — бесплатный API курсов валют.
 * Кеш в localStorage для быстрой конвертации при перезагрузке.
 */

const RATES_CACHE_KEY = 'etoro_usd_rates';
const RATES_CACHE_TTL_MS = 2 * 60 * 1000; // 2 минуты

function getCachedRates(): UsdRates | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as UsdRates & { _ts?: number };
    const ts = (data as { _ts?: number })._ts;
    if (!ts || !data.usd) return null;
    if (Date.now() - ts > RATES_CACHE_TTL_MS) return data; // вернём и устаревшие
    return { date: data.date, usd: data.usd };
  } catch {
    return null;
  }
}

function setCachedRates(rates: UsdRates) {
  try {
    const payload = { ...rates, _ts: Date.now() };
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1';
const FALLBACK_BASE = 'https://latest.currency-api.pages.dev/v1';

/** Курсы относительно рубля: 1 RUB = rub[currency] единиц валюты */
export interface RubRates {
  date: string;
  rub: Record<string, number>;
}

/** Курсы относительно доллара: 1 USD = usd[currency] единиц валюты */
export interface UsdRates {
  date: string;
  usd: Record<string, number>;
}

/** Список валют: код -> название */
export interface CurrenciesList {
  [code: string]: string;
}

async function fetchWithFallback<T>(path: string): Promise<T> {
  const tryFetch = async (base: string): Promise<Response> => {
    const url = `${base}${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  };

  try {
    const res = await tryFetch(CDN_BASE);
    return (await res.json()) as T;
  } catch {
    const res = await tryFetch(FALLBACK_BASE);
    return (await res.json()) as T;
  }
}

/**
 * Получить курсы относительно рубля.
 * rub.usd = 0.013 → 1 RUB = 0.013 USD
 */
export async function fetchRubRates(): Promise<RubRates> {
  return fetchWithFallback<RubRates>('/currencies/rub.min.json');
}

const DATED_CDN_PKG = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';

/**
 * Актуальные курсы USD (всегда с сети, для котировок Forex/торговли).
 * Помимо основного кеша валют — обновляет etoro_usd_rates.
 */
export async function fetchUsdRatesLive(): Promise<UsdRates> {
  try {
    const data = await fetchWithFallback<UsdRates>('/currencies/usd.min.json');
    if (data?.usd) setCachedRates(data);
    return data;
  } catch {
    const cached = getCachedRates();
    if (cached?.usd) return { date: cached.date, usd: cached.usd };
    return { date: '', usd: { rub: 100, usd: 1 } };
  }
}

/** Курсы USD на календарную дату (UTC YYYY-MM-DD), для расчёта ~24h change. */
export async function fetchUsdRatesOnDate(isoDate: string): Promise<UsdRates | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const url = `${DATED_CDN_PKG}@${isoDate}/v1/currencies/usd.min.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as UsdRates;
    return data?.usd && Object.keys(data.usd).length > 5 ? data : null;
  } catch {
    return null;
  }
}

/**
 * Получить курсы относительно доллара.
 * usd.rub = 92.5 → 1 USD = 92.5 RUB
 * Кеш: при наличии — возврат сразу; фоновое обновление для свежего кеша.
 */
export async function fetchUsdRates(): Promise<UsdRates> {
  const cached = getCachedRates();
  if (cached?.usd) {
    fetchWithFallback<UsdRates>('/currencies/usd.min.json')
      .then((data) => { if (data?.usd) setCachedRates(data); })
      .catch(() => {});
    return cached;
  }
  try {
    const data = await fetchWithFallback<UsdRates>('/currencies/usd.min.json');
    if (data?.usd) setCachedRates(data);
    return data;
  } catch {
    return { date: '', usd: { rub: 100, usd: 1 } };
  }
}

/**
 * Список всех доступных валют.
 */
export async function fetchCurrenciesList(): Promise<CurrenciesList> {
  return fetchWithFallback<CurrenciesList>('/currencies.min.json');
}
