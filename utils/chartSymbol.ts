/**
 * Символ для виджета TradingView: биржа + пара.
 * Крипта по умолчанию: BINANCE:XXXUSDT.
 * Forex: FX_IDC:EURUSD и т.д. (IDEALPRO / межбанк в TV).
 */

import type { Asset } from '../types';

/** Полный символ TradingView для конкретных тикеров. */
const SYMBOL_OVERRIDES: Record<string, string> = {
  /** USDT как базовая валюта — пары USDTUSDT нет, показываем USDC/USDT. */
  USDT: 'BINANCE:USDCUSDT',
};

const EXCHANGE = 'BINANCE';

/**
 * Возвращает символ для TradingView.
 * Если для тикера есть явный override — используем его, иначе BINANCE:XXXUSDT.
 */
export function getTradingViewSymbol(ticker: string): string {
  const override = SYMBOL_OVERRIDES[ticker];
  if (override) return override;
  return `${EXCHANGE}:${ticker}USDT`;
}

/**
 * Символ для подписи в UI: например "BTCUSDT".
 */
export function getTradingViewSymbolLabel(ticker: string): string {
  const override = SYMBOL_OVERRIDES[ticker];
  if (override) {
    const [, pair] = override.split(':');
    return pair || override;
  }
  return `${ticker}USDT`;
}

/** Символ виджета по активу (крипта / forex / явный override). */
export function getTradingViewSymbolForAsset(asset: Pick<Asset, 'ticker' | 'category' | 'tradingViewSymbol'>): string {
  if (asset.tradingViewSymbol) return asset.tradingViewSymbol;
  if (asset.category === 'forex') return `FX_IDC:${asset.ticker}`;
  return getTradingViewSymbol(asset.ticker);
}

/** Подпись пары в UI (EUR/USD для forex). */
export function getTradingViewSymbolLabelForAsset(asset: Pick<Asset, 'ticker' | 'category'>): string {
  if (asset.category === 'forex' && asset.ticker.length === 6) {
    return `${asset.ticker.slice(0, 3)}/${asset.ticker.slice(3)}`;
  }
  return getTradingViewSymbolLabel(asset.ticker);
}

/** Отображение котировки FX (курс пары, не сумма в валюте счёта). */
export function formatFxRateQuote(rate: number): string {
  const abs = Math.abs(rate);
  const digits = abs >= 10 ? 3 : 5;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(rate);
}

/** Стиль «Минималистичный нео-нуар»: фон #131722, свечи изумруд/коралл, сетка приглушённая */
const CHART_THEME_OVERRIDES: Record<string, string> = {
  'paneProperties.background': '#131722',
  'paneProperties.backgroundType': 'solid',
  'paneProperties.vertGridColor': 'rgba(36, 39, 53, 0.5)',
  'paneProperties.horzGridColor': 'rgba(36, 39, 53, 0.5)',
  'mainSeriesProperties.candleStyle.upColor': '#00D09C',
  'mainSeriesProperties.candleStyle.downColor': '#FF4A68',
  'mainSeriesProperties.candleStyle.borderUpColor': '#00D09C',
  'mainSeriesProperties.candleStyle.borderDownColor': '#FF4A68',
  'mainSeriesProperties.candleStyle.wickUpColor': '#00D09C',
  'mainSeriesProperties.candleStyle.wickDownColor': '#FF4A68',
};

/** URL виджета TradingView с темой нео-нуар, скрыта левая панель рисования */
export function getTradingViewChartUrl(symbol: string): string {
  const base = 'https://s.tradingview.com/widgetembed/';
  const params = new URLSearchParams({
    frameElementId: 'tradingview_chart',
    symbol,
    interval: '5',
    hidesidetoolbar: '1',
    hidetoptoolbar: '0',
    symboledit: '0',
    saveimage: '0',
    toolbarbg: 'rgba(19, 23, 34, 0)',
    studies: '[]',
    hide_legend: '1',
    theme: 'dark',
    style: '1',
    timezone: 'Etc/UTC',
    studies_overrides: '{}',
    overrides: JSON.stringify(CHART_THEME_OVERRIDES),
    enabled_features: '[]',
    disabled_features: '[]',
    locale: 'ru',
    utm_source: 'localhost',
    utm_medium: 'widget',
    utm_campaign: 'chart',
    utm_term: symbol,
  });
  return `${base}?${params.toString()}`;
}
