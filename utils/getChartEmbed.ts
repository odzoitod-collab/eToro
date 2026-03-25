import type { Asset } from '../types';
import { getTradingViewSymbolForAsset, getTradingViewSymbol } from './chartSymbol';
import { getCoinGeckoId } from '../lib/cryptoPrices';

export type ChartProvider = 'TV' | 'INV' | 'GCK';
export type ChartStyle = 'candles' | 'bars' | 'line';
export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';

export interface GetChartEmbedOptions {
  provider: ChartProvider;
  interval?: ChartInterval;
  chartStyle?: ChartStyle;
}

export type ChartEmbedResult =
  | { kind: 'iframe'; src: string }
  | { kind: 'gck'; coinId: string | undefined };

function mapIntervalToTvValue(interval?: ChartInterval): string {
  switch (interval) {
    case '1m':
      return '1';
    case '5m':
      return '5';
    case '15m':
      return '15';
    case '1h':
      return '60';
    case '4h':
      return '240';
    case '1D':
      return 'D';
    case '1W':
      return 'W';
    default:
      return '5';
  }
}

function mapChartStyleToTvStyle(style?: ChartStyle): string {
  switch (style) {
    case 'candles':
      return '1';
    case 'bars':
      return '4';
    case 'line':
      return '2';
    default:
      return '1';
  }
}

/**
 * Унифицированный embed-источник для вкладки CHART:
 * - TV: TradingView widgetembed
 * - INV: Investing.com widgetlab (для Forex)
 * - GCK: CoinGecko web component (для crypto)
 */
export function getChartEmbed(asset: Asset, options: GetChartEmbedOptions): ChartEmbedResult {
  const provider = options.provider;
  const interval = mapIntervalToTvValue(options.interval);
  const style = mapChartStyleToTvStyle(options.chartStyle);

  // TradingView (дефолт для всех типов)
  if (provider === 'TV') {
    const symbol = getTradingViewSymbolForAsset(asset);
    const overrides = {
      'paneProperties.background': '#131722',
      'paneProperties.backgroundType': 'solid',
      'paneProperties.gridLinesMode': 'Custom',
      'paneProperties.horzGridProperties.color': 'rgba(36,39,53,0.5)',
      'paneProperties.vertGridProperties.color': 'rgba(36,39,53,0.3)',
      'scalesProperties.textColor': '#6b7280',
      'scalesProperties.fontSize': 11,
      'candleStyle.upColor': '#10b981',
      'candleStyle.downColor': '#f87171',
      'candleStyle.borderUpColor': '#10b981',
      'candleStyle.borderDownColor': '#f87171',
      'candleStyle.wickUpColor': '#10b981',
      'candleStyle.wickDownColor': '#f87171',
    };

    const params = new URLSearchParams({
      frameElementId: 'tradingview_chart',
      symbol,
      interval,
      theme: 'dark',
      style,
      locale: 'ru',
      hidesidetoolbar: '1',
      hide_legend: '1',
      'hide_top_toolbar': '1',
      hidetoptoolbar: '1',
      symboledit: '0',
      saveimage: '0',
      'allow_symbol_change': '0',
      // URLSearchParams сам закодирует строку JSON в query string
      overrides: JSON.stringify(overrides),
      no_referral_id: '1',
      utm_source: 'none',
    });

    return { kind: 'iframe', src: `https://s.tradingview.com/widgetembed/?${params.toString()}` };
  }

  // Investing.com (Forex)
  if (provider === 'INV') {
    // Если внезапно пытаемся показать INV не для forex — fallback на TV.
    if (asset.category !== 'forex') {
      const tv = getChartEmbed(asset, { provider: 'TV', interval: options.interval, chartStyle: options.chartStyle });
      return tv.kind === 'iframe' ? tv : { kind: 'iframe', src: '' };
    }

    // widgetlab/live_currency_rates использует пары как EURUSD, GBPUSD и т.д.
    // Высота/ширина контент-100% — задаём в iframe атрибутах.
    const pairs = asset.ticker;
    const src = `https://www.investing.com/widgetlab/live_currency_rates?theme=dark&pairs=${encodeURIComponent(
      pairs
    )}&width=100%&height=100%&bg_color=131722&text_color=9ca3af&bold_color=FFFFFF`;

    return { kind: 'iframe', src };
  }

  // CoinGecko widget (crypto)
  const coinId = asset.coingeckoId ?? getCoinGeckoId(asset.ticker);
  return { kind: 'gck', coinId };
}

// Привычный fallback symbol для случаев, когда getTradingViewSymbolForAsset не может определить корректный формат.
// Оставлено на будущее, сейчас не используется напрямую.
export function fallbackTradingViewSymbol(ticker: string): string {
  return getTradingViewSymbol(ticker);
}

