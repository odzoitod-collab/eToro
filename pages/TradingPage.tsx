import React, { useRef, useState, useEffect } from 'react';
import { Asset, Deal } from '../types';
import { Clock, Zap, Check, X, ChevronDown, Info, BarChart3, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Haptic } from '../utils/haptics';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import { usePin } from '../context/PinContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebAuth } from '../context/WebAuthContext';
import {
  getTradingViewSymbolForAsset,
  getTradingViewSymbolLabelForAsset,
  formatFxRateQuote,
} from '../utils/chartSymbol';
import { fetchAssetPricesInRub } from '../lib/cryptoPrices';
import { spotBuy, spotSell } from '../lib/spot';
import type { SpotHolding } from '../types';
import CoinsPage from './CoinsPage';
import BottomSheet from '../components/BottomSheet';
import BottomSheetFooter from '../components/BottomSheetFooter';
import { Z_INDEX } from '../constants/zIndex';
import { getChartEmbed, type ChartProvider, type ChartInterval, type ChartStyle } from '../utils/getChartEmbed';

const MIN_DEAL_RUB = 100;

interface TradingPageProps {
  asset: Asset | null;
  balance: number;
  tradingBlocked?: boolean;
  onBack: () => void;
  onOpenDeal: (deal: Deal) => void;
  onChangeAsset?: (asset: Asset) => void;
  spotHoldings?: SpotHolding[];
  onSpotComplete?: () => void;
  onReferralSpotBuy?: (ticker: string, amountRub: number) => void;
  initialTradeType?: 'futures' | 'spot';
  initialSpotAction?: 'buy' | 'sell';
}

type Tab = 'CHART' | 'TRADE' | 'RULES';
type Side = 'UP' | 'DOWN';

const TIMEFRAMES = [
  { label: '10с', sec: 10 },
  { label: '30с', sec: 30 },
  { label: '1м', sec: 60 },
  { label: '5м', sec: 300 },
  { label: '15м', sec: 900 },
  { label: '30м', sec: 1800 },
  { label: '1ч', sec: 3600 },
];

const CHART_TIMEFRAMES: ChartInterval[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];

const chartStyleToLabel: Record<ChartStyle, string> = {
  candles: 'Candles',
  bars: 'Bars',
  line: 'Line',
};

function ChartToolbar(props: {
  asset: Asset;
  ticker: string;
  price: string;
  change24h: number;
  chartStyle: ChartStyle;
  onChartStyleChange: (next: ChartStyle) => void;
  provider: ChartProvider;
  onProviderChange: (next: ChartProvider) => void;
  isForex: boolean;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onCloseFullscreen: () => void;
}) {
  const {
    asset,
    ticker,
    price,
    change24h,
    chartStyle,
    onChartStyleChange,
    provider,
    onProviderChange,
    isForex,
    isFullscreen,
    onFullscreenToggle,
    onCloseFullscreen,
  } = props;

  const changeColor = (change24h ?? 0) >= 0 ? '#10b981' : '#f87171';
  const changeText = `${(change24h ?? 0) >= 0 ? '+' : ''}${(change24h ?? 0).toFixed(2)}%`;

  const providerOptions: ChartProvider[] = asset.category === 'forex' ? ['TV', 'INV'] : ['TV'];
  const canRenderChartTypes = true;

  const iconStrokeProps = {
    stroke: 'currentColor',
    strokeWidth: 1.5,
    fill: 'none',
  } as const;

  const CandlesIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <rect x="3" y="4" width="3" height="6" rx="0.5" />
      <line x1="4.5" y1="1" x2="4.5" y2="4" />
      <line x1="4.5" y1="10" x2="4.5" y2="13" />
      <rect x="8" y="2" width="3" height="8" rx="0.5" />
      <line x1="9.5" y1="1" x2="9.5" y2="2" />
      <line x1="9.5" y1="10" x2="9.5" y2="12" />
    </svg>
  );

  const BarsIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <line x1="3" y1="2" x2="3" y2="12" />
      <line x1="3" y1="4" x2="5" y2="4" />
      <line x1="8" y1="3" x2="8" y2="11" />
      <line x1="8" y1="8" x2="10" y2="8" />
      <line x1="2" y1="6" x2="2" y2="7" opacity={0.0} />
    </svg>
  );

  const LineIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <polyline points="1,10 4,5 7,8 10,3 13,6" />
    </svg>
  );

  const ExpandIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <path d="M1 5 L1 1 L5 1" />
      <path d="M9 1 L13 1 L13 5" />
      <path d="M1 9 L1 13 L5 13" />
      <path d="M9 13 L13 13 L13 9" />
    </svg>
  );

  const CloseXIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <path d="M3 3 L11 11" />
      <path d="M11 3 L3 11" />
    </svg>
  );

  return (
    <div
      className={`bg-background/80 backdrop-blur-sm border-b border-border/40 px-4 py-2 flex items-center gap-2 transition-all duration-300 ${
        isFullscreen ? 'fixed top-0 left-0 right-0 z-51' : 'absolute top-0 left-0 right-0 z-20'
      }`}
    >
      {/* a) Ticker + price + change */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm font-bold text-white truncate">{ticker}</span>
        <span className="font-mono text-xs text-neon truncate max-w-[90px]">{price}</span>
        <span className="text-xs" style={{ color: changeColor }}>
          {changeText}
        </span>
      </div>

      {/* b) divider */}
      <div className="w-px h-4 bg-border/60 mx-1" />

      {/* e) Chart style */}
      <div className="hidden md:flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChartStyleChange('candles')}
          className={`p-1.5 rounded border transition-colors ${
            chartStyle === 'candles'
              ? 'bg-card text-neon border-neon/30'
              : 'text-textMuted border-transparent hover:text-white'
          }`}
          aria-label={chartStyleToLabel.candles}
          title={chartStyleToLabel.candles}
          disabled={!canRenderChartTypes}
        >
          <CandlesIcon />
        </button>
        <button
          type="button"
          onClick={() => onChartStyleChange('bars')}
          className={`p-1.5 rounded border transition-colors ${
            chartStyle === 'bars'
              ? 'bg-card text-neon border-neon/30'
              : 'text-textMuted border-transparent hover:text-white'
          }`}
          aria-label={chartStyleToLabel.bars}
          title={chartStyleToLabel.bars}
          disabled={!canRenderChartTypes}
        >
          <BarsIcon />
        </button>
        <button
          type="button"
          onClick={() => onChartStyleChange('line')}
          className={`p-1.5 rounded border transition-colors ${
            chartStyle === 'line'
              ? 'bg-card text-neon border-neon/30'
              : 'text-textMuted border-transparent hover:text-white'
          }`}
          aria-label={chartStyleToLabel.line}
          title={chartStyleToLabel.line}
          disabled={!canRenderChartTypes}
        >
          <LineIcon />
        </button>
      </div>

      {/* f) flex-grow divider */}
      <div className="flex-1" />

      {/* g) provider buttons */}
      <div className="flex items-center gap-1">
        {providerOptions.map((p) => {
          const active = provider === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onProviderChange(p)}
              className={`whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                active ? 'text-neon border-neon/40 bg-neon/5' : 'text-textMuted border-transparent hover:text-white'
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* h) fullscreen button */}
      {/* Fullscreen button отключён по запросу */}
    </div>
  );
}

function ChartEmbed(props: {
  asset: Asset;
  provider: ChartProvider;
  interval: ChartInterval;
  chartStyle: ChartStyle;
  chartLoaded: boolean;
  setChartLoaded: (v: boolean) => void;
  isFullscreen: boolean;
}) {
  const { asset, provider, interval, chartStyle, setChartLoaded } = props;
  const embed = getChartEmbed(asset, { provider, interval, chartStyle });
  const embedKey = `${provider}-${interval}-${chartStyle}-${asset.ticker}`;

  if (embed.kind === 'iframe') {
    return (
      <iframe
        key={embedKey}
        title="chart"
        className="w-full h-full border-0 rounded-none"
        style={{ border: 'none', outline: 'none' }}
        src={embed.src}
        scrolling="no"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={() => setChartLoaded(true)}
      />
    );
  }

  // CoinGecko полностью отключен по ТЗ: не рендерим web-component.
  if (embed.kind === 'gck') return null;

  // GCK (CoinGecko web component)
  return (
    <div key={embedKey} className="w-full h-full">
      <div className="w-full h-full bg-[#131722] overflow-hidden">
        <gecko-coin-price-chart-widget
          locale="ru"
          dark-mode="true"
          transparent-background="true"
          coin-id={embed.coinId ?? ''}
          initial-currency="usd"
          width="100%"
          height="100%"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </div>
  );
}

const TradingPage: React.FC<TradingPageProps> = ({
  asset,
  balance,
  tradingBlocked = false,
  onBack,
  onOpenDeal,
  onChangeAsset,
  spotHoldings = [],
  onSpotComplete,
  onReferralSpotBuy,
  initialTradeType,
  initialSpotAction,
}) => {
  const toast = useToast();
  const { user, tgid } = useUser();
  const { webUserId } = useWebAuth();
  const { requirePin } = usePin();
  const { formatPrice, convertFromRub, convertToRub, symbol, currencyCode, baseCurrency, rates } = useCurrency();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('TRADE');
  const [tradeType, setTradeType] = useState<'futures' | 'spot'>(initialTradeType ?? 'futures');
  const [spotAction, setSpotAction] = useState<'buy' | 'sell'>(initialSpotAction ?? 'buy');
  /** Сумма покупки спот в валюте баланса — вводится в той же валюте, что и баланс (RUB, USD и т.д.) */
  const [spotAmount, setSpotAmount] = useState<string>(() =>
    baseCurrency === 'rub' ? '1000' : baseCurrency === 'usd' ? '50' : baseCurrency === 'eur' ? '50' : '100'
  );
  const [spotQuantity, setSpotQuantity] = useState<string>('');
  const [spotLoading, setSpotLoading] = useState(false);
  const [leverage, setLeverage] = useState(10);
  const [amount, setAmount] = useState<string>('1000');
  const [duration, setDuration] = useState<number>(30);
  const [side, setSide] = useState<Side>('UP');
  const [livePrice, setLivePrice] = useState(asset?.price ?? 0);
  /** Актуальность котировки с API (шапка, стакан, FX); обновляется опросом цены. */
  const [quoteUnavailable, setQuoteUnavailable] = useState(asset?.priceUnavailable ?? false);
  const [displayChange24h, setDisplayChange24h] = useState(asset?.change24h ?? 0);
  const [showAssetSearch, setShowAssetSearch] = useState(false);

  const prevLivePriceRef = useRef<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'flat'>('flat');
  /** Flash effect для стакана: сбрасывается через 300ms после смены направления */
  const [flashDirection, setFlashDirection] = useState<'up' | 'down' | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSpotConfirm, setShowSpotConfirm] = useState<'buy' | 'sell' | null>(null);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [interval, setInterval] = useState<ChartInterval>('5m');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candles');
  const [provider, setProvider] = useState<ChartProvider>('TV');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartAnimMode, setChartAnimMode] = useState<'fade' | 'slide'>('fade');

  const [asks, setAsks] = useState<{price: number, size: number}[]>([]);
  const [bids, setBids] = useState<{price: number, size: number}[]>([]);
  const [orderBookBase, setOrderBookBase] = useState(0);

  const userIdNum = user?.user_id ?? (tgid ? Number(tgid) : webUserId ?? 0);
  const currentHolding = spotHoldings.find((h) => h.ticker === asset?.ticker);
  const holdingAmount = currentHolding?.amount ?? 0;

  useEffect(() => {
    if (!asset) return;
    if (asset.category === 'forex') {
      setTradeType('futures');
    } else if (initialTradeType) {
      setTradeType(initialTradeType);
    }
    if (initialSpotAction) setSpotAction(initialSpotAction);
    if (initialSpotAction === 'sell' && currentHolding) {
      setSpotQuantity(String(currentHolding.amount));
    }
  }, [initialTradeType, initialSpotAction, asset, currentHolding?.amount]);

  /** Дефолт суммы спот при смене валюты баланса (синхронизация с бэком или смена в настройках) */
  useEffect(() => {
    const defaultAmount = baseCurrency === 'rub' ? '1000' : baseCurrency === 'usd' ? '50' : baseCurrency === 'eur' ? '50' : '100';
    setSpotAmount(defaultAmount);
  }, [baseCurrency]);

  // Сбрасываем состояние отрисовки графика при смене актива и настроек
  useEffect(() => { setChartLoaded(false); }, [asset?.ticker]);

  // Ограничиваем провайдеры по типу актива и закрываем fullscreen при смене тикера
  useEffect(() => {
    if (!asset) return;
    setIsFullscreen(false);
    if (asset.category === 'forex') {
      setProvider((p) => (p === 'INV' || p === 'TV' ? p : 'TV'));
      return;
    }
    if (asset.category === 'crypto') {
      setProvider('TV');
      return;
    }
    setProvider('TV');
  }, [asset?.ticker, asset?.category]);

  // Быстрые анимации на смене режима/параметров
  useEffect(() => {
    setChartAnimMode('fade');
    setChartLoaded(false);
  }, [interval, chartStyle]);

  useEffect(() => {
    setChartAnimMode('slide');
    setChartLoaded(false);
  }, [provider]);

  // CoinGecko (GCK) отключён по ТЗ — соответствующие загрузчики удалены.

  // Живая цена в шапке - обновляем из API каждые 10 секунд
  useEffect(() => {
    if (!asset) return;
    
    const updatePrice = async () => {
      try {
        const prices = await fetchAssetPricesInRub([asset.ticker]);
        const row = prices[asset.ticker];
        if (row) {
          const next = row.price;
          const prev = prevLivePriceRef.current;
          setQuoteUnavailable(row.unavailable === true);
          if (row.change24h != null && Number.isFinite(row.change24h)) {
            setDisplayChange24h(row.change24h);
          }

          if (prev == null) {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          } else if (next > prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('up');
            setFlashDirection('up');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else if (next < prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('down');
            setFlashDirection('down');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          }

          setLivePrice(next);
        }
      } catch (error) {
        console.error('Failed to fetch price:', error);
      }
    };

    // При смене актива: сбрасываем направление (первый тик будет нейтральным)
    prevLivePriceRef.current = null;
    setPriceDirection('flat');
    setLivePrice(asset.price);
    setQuoteUnavailable(asset.priceUnavailable ?? false);
    setDisplayChange24h(asset.change24h ?? 0);

    // Обновляем цену каждые 10 секунд
    updatePrice();
    const t = setInterval(updatePrice, 10000);
    return () => clearInterval(t);
  }, [asset?.ticker, asset?.price]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // Живой стакан: обновляем на основе реальной цены (FOREX — уже́ узкие уровни относительно цены)
  useEffect(() => {
    if (livePrice <= 0) return;

    setOrderBookBase(livePrice);
    const rel = asset?.category === 'forex' ? 0.00008 : 0.0003;
    const generate = (b: number, type: 'ask' | 'bid') =>
      Array.from({ length: 8 }).map((_, i) => {
        const diff = b * (rel * (i + 1) + Math.random() * rel * 0.65);
        const price = type === 'ask' ? b + diff : b - diff;
        return { price, size: 0.5 + Math.random() * 2 };
      });
    setAsks(generate(livePrice, 'ask').reverse());
    setBids(generate(livePrice, 'bid'));
  }, [livePrice, asset?.category]);

  if (!asset) return <div className="p-10 text-center text-neutral-500">{t('asset_not_selected')}</div>;

  const isForex = asset.category === 'forex';
  const rubPerUsd = rates?.usd?.rub;
  const midPriceRub = livePrice > 0 ? livePrice : asset.price;
  const showAsFxQuote = isForex && rubPerUsd != null && rubPerUsd > 0 && !quoteUnavailable;

  const quote = (currencyCode || 'USD').toUpperCase();
  const pairLabel =
    isForex && asset.ticker.length === 6
      ? `${asset.ticker.slice(0, 3)}/${asset.ticker.slice(3)}`
      : `${asset.ticker} ${quote}`;

  const handlePreTrade = () => {
      if (tradingBlocked) {
        Haptic.error();
        toast.show(t('trading_blocked_toast'), 'error');
        return;
      }
      Haptic.light();
      const displayAmount = parseFloat(amount.replace(',', '.')) || 0;
      const amountRub = convertToRub(displayAmount);
      if (amountRub <= 0) {
          Haptic.error();
          return;
      }
      if (amountRub < MIN_DEAL_RUB) {
          Haptic.error();
          toast.show(`${t('min_deal_toast', { amount: formatPrice(MIN_DEAL_RUB) })} ${symbol}`, 'error');
          return;
      }
      if (amountRub > balance) {
          Haptic.error();
          toast.show(t('insufficient_balance'), 'error');
          return;
      }
      setShowConfirm(true);
  };

  const handleConfirmTrade = () => {
      setShowConfirm(false);
      setShowSuccess(true);
      
      const displayAmount = parseFloat(amount.replace(',', '.')) || 0;
      const amountRub = Math.max(0, Math.round(convertToRub(displayAmount)));
      const newDeal: Deal = {
        id: Date.now().toString(),
        assetTicker: asset.ticker,
        side: side,
        amount: amountRub,
        leverage: leverage,
        entryPrice: livePrice,
        startTime: Date.now(),
        durationSeconds: duration,
        status: 'ACTIVE'
      };
      onOpenDeal(newDeal);
  };

  const handleSpotBuy = async () => {
    if (!userIdNum || livePrice <= 0) return;
    const displayAmount = parseFloat(spotAmount.replace(',', '.')) || 0;
    const amountRub = convertToRub(displayAmount);
    if (amountRub < MIN_DEAL_RUB) {
      toast.show(`${t('min_deal_toast', { amount: formatPrice(MIN_DEAL_RUB) })} ${symbol}`, 'error');
      return;
    }
    if (amountRub > balance) {
      toast.show(t('insufficient_balance'), 'error');
      return;
    }
    setSpotLoading(true);
    const res = await spotBuy(userIdNum, asset.ticker, amountRub, livePrice);
    setSpotLoading(false);
    setShowSpotConfirm(null);
    if (res.ok) {
      toast.show(t('deal_created'), 'success');
      onSpotComplete?.();
      onReferralSpotBuy?.(asset.ticker, amountRub);
    } else {
      toast.show(res.error || t('deal_creation_error'), 'error');
    }
  };

  const handleSpotSell = async () => {
    if (!userIdNum || livePrice <= 0) return;
    const qty = parseFloat(spotQuantity) || 0;
    if (qty <= 0 || qty > holdingAmount) {
      toast.show(t('insufficient_balance'), 'error');
      return;
    }
    setSpotLoading(true);
    const res = await spotSell(userIdNum, asset.ticker, qty, livePrice);
    setSpotLoading(false);
    setShowSpotConfirm(null);
    if (res.ok) {
      toast.show(t('deal_created'), 'success');
      onSpotComplete?.();
    } else {
      toast.show(res.error || t('deal_creation_error'), 'error');
    }
  };

  const handleSpotConfirmWithPin = () => {
    const uid = tgid || webUserId?.toString();
    if (showSpotConfirm === 'buy') {
      if (uid) requirePin(uid, t('enter_pin_for_confirm'), handleSpotBuy);
      else handleSpotBuy();
    } else if (showSpotConfirm === 'sell') {
      if (uid) requirePin(uid, t('enter_pin_for_confirm'), handleSpotSell);
      else handleSpotSell();
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-background animate-fade-in relative overflow-hidden mx-auto ${
        activeTab === 'CHART' ? 'w-full max-w-none' : 'max-w-2xl lg:max-w-4xl xl:max-w-5xl'
      }`}
    >
      {!isFullscreen && (
        <>
          <PageHeader
            title={
              <button
                type="button"
                onClick={() => { Haptic.tap(); setShowAssetSearch(true); }}
                className="text-lg font-semibold text-textPrimary tracking-tight hover:text-neon transition-colors active:scale-[0.99] text-left"
                aria-label={t('search_pair')}
              >
                {pairLabel}
              </button>
            }
            onBack={onBack}
            right={
              <span className={`text-sm font-mono font-bold ${priceDirection === 'up' ? 'text-up' : priceDirection === 'down' ? 'text-down' : 'text-textPrimary'}`}>
                {quoteUnavailable
                  ? '—'
                  : showAsFxQuote
                    ? formatFxRateQuote(midPriceRub / rubPerUsd!)
                    : `${formatPrice(livePrice)} ${symbol}`}
              </span>
            }
          />
          {/* 2. Tabs — График | Торговля | Правила */}
          <div className="flex items-stretch pt-0 border-b border-border z-20 bg-background">
            <button
              onClick={() => { Haptic.tap(); setActiveTab('CHART'); }}
              className={`flex-1 py-3 text-sm font-medium relative transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${activeTab === 'CHART' ? 'text-neon' : 'text-neutral-500 hover:text-neutral-400'}`}
            >
              {t('chart')}
              {activeTab === 'CHART' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-neon transition-opacity duration-200" />}
            </button>
            <button
              onClick={() => { Haptic.tap(); setActiveTab('TRADE'); }}
              className={`flex-1 py-3 text-sm font-medium relative transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${activeTab === 'TRADE' ? 'text-neon' : 'text-neutral-500 hover:text-neutral-400'}`}
            >
              {t('trade')}
              {activeTab === 'TRADE' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-neon transition-opacity duration-200" />}
            </button>
            <button
              onClick={() => { Haptic.tap(); setActiveTab('RULES'); }}
              className={`flex-1 py-3 text-sm font-medium relative transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${activeTab === 'RULES' ? 'text-neon' : 'text-neutral-500 hover:text-neutral-400'}`}
            >
              {t('rules')}
              {activeTab === 'RULES' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-neon transition-opacity duration-200" />}
            </button>
          </div>
        </>
      )}

      {/* 3. Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* VIEW: CHART — edge-to-edge график */}
        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${
            activeTab === 'CHART' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          <div className="relative w-full overflow-hidden flex flex-col h-full">
            <ChartToolbar
              asset={asset}
              ticker={asset.ticker}
              price={
                quoteUnavailable
                  ? '—'
                  : showAsFxQuote
                    ? formatFxRateQuote(midPriceRub / rubPerUsd!)
                    : formatPrice(livePrice)
              }
              change24h={displayChange24h ?? 0}
              interval={interval}
              onIntervalChange={setInterval}
              chartStyle={chartStyle}
              onChartStyleChange={setChartStyle}
              provider={provider}
              onProviderChange={setProvider}
              isForex={asset.category === 'forex'}
              isFullscreen={isFullscreen}
              onFullscreenToggle={() => setIsFullscreen((v) => !v)}
              onCloseFullscreen={() => setIsFullscreen(false)}
            />

            {/* График: edge-to-edge контейнер */}
            <div
              className={`relative w-full bg-[#131722] overflow-hidden flex-1 min-h-[360px] md:min-h-[480px] lg:min-h-[560px] ${
                isFullscreen ? 'fixed inset-0 z-50 chart-fullscreen transition-all duration-300' : ''
              }`}
              style={isFullscreen ? { transition: 'all 300ms ease' } : undefined}
            >
              {/* Watermark */}
              <div
                className="absolute flex items-center justify-center pointer-events-none select-none z-20 left-0 right-0 top-12 bottom-0"
                aria-hidden
              >
                <span
                  className="font-bold text-white opacity-[0.018] tracking-tighter text-[80px] md:text-[120px] lg:text-[150px]"
                >
                  {asset.ticker}
                </span>
              </div>

              {/* Skeleton */}
              {!chartLoaded && (
                <div
                  className="absolute flex items-center justify-center pointer-events-none z-20 left-0 right-0 top-12 bottom-0"
                  aria-hidden
                >
                  <div className="relative w-full h-full opacity-[0.04] animate-pulse">
                    <svg
                      className="w-full h-full"
                      viewBox="0 0 400 200"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="chart-skeleton-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#00D09C" />
                          <stop offset="50%" stopColor="#00D09C" />
                          <stop offset="50%" stopColor="#FF4A68" />
                          <stop offset="100%" stopColor="#FF4A68" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,120 Q50,80 100,100 T200,60 T300,140 T400,90"
                        fill="none"
                        stroke="url(#chart-skeleton-grad-2)"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    {/* shimmer-анимация как доп. слой */}
                    <div
                      className="absolute inset-0"
                      style={{
                        animation: 'shimmer 1.4s ease-in-out infinite',
                        background:
                          'linear-gradient(90deg, rgba(33,176,83,0.02) 0%, rgba(33,176,83,0.10) 50%, rgba(33,176,83,0.02) 100%)',
                      }}
                    />
                    {/* два «прямоугольника-свечи» как placeholder */}
                    <div className="absolute left-[10%] top-[25%] w-[10px] h-[45px] bg-[#00D09C]/20 rounded-[4px] animate-pulse" />
                    <div className="absolute left-[52%] top-[35%] w-[10px] h-[35px] bg-[#FF4A68]/20 rounded-[4px] animate-pulse" />
                  </div>
                </div>
              )}

              {/* Embed */}
              <div
                className={`absolute z-10 transition-all left-0 right-0 top-12 bottom-0 ${
                  chartAnimMode === 'fade' ? 'duration-150' : 'duration-200'
                } ease-[cubic-bezier(0.4,0,0.2,1)] ${
                  chartAnimMode === 'slide' ? 'translate-y-[8px]' : ''
                } ${chartLoaded ? 'opacity-100 translate-y-0' : 'opacity-0'}`}
              >
                <ChartEmbed
                  asset={asset}
                  provider={provider}
                  interval={interval}
                  chartStyle={chartStyle}
                  chartLoaded={chartLoaded}
                  setChartLoaded={setChartLoaded}
                  isFullscreen={isFullscreen}
                />
              </div>
            </div>

            {/* Лента данных снизу (только не fullscreen) */}
            {!isFullscreen && (
              <div className="w-full px-4 py-3 border-t border-border/40 bg-background overflow-hidden relative z-30">
                <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
                  <div className="min-w-[90px]">
                    <div className="text-[10px] text-textMuted uppercase font-bold">{t('ticker')}</div>
                    <div className="text-xs font-mono text-white font-bold">{getTradingViewSymbolLabelForAsset(asset)}</div>
                  </div>
                  <div className="min-w-[90px]">
                    <div className="text-[10px] text-textMuted uppercase font-bold">{t('price')}</div>
                    <div className="text-xs font-mono text-neon font-bold">
                      {quoteUnavailable
                        ? '—'
                        : showAsFxQuote
                          ? formatFxRateQuote(midPriceRub / rubPerUsd!)
                          : formatPrice(livePrice)}
                    </div>
                  </div>
                  <div className="min-w-[90px]">
                    <div className="text-[10px] text-textMuted uppercase font-bold">{t('change_24h_val')}</div>
                    <div
                      className={`text-xs font-mono font-bold ${
                        (displayChange24h ?? 0) >= 0 ? 'text-up' : 'text-down'
                      }`}
                    >
                      {(displayChange24h ?? 0) >= 0 ? '+' : ''}
                      {(displayChange24h ?? 0).toFixed(2)}%
                    </div>
                  </div>
                  <div className="min-w-[120px]">
                    <div className="text-[10px] text-textMuted uppercase font-bold">{t('volume_24h')}</div>
                    <div className="text-xs text-textSecondary">
                      {asset.volume24h >= 1e9
                        ? (convertFromRub(asset.volume24h) / 1e9).toFixed(2) + ' млрд'
                        : asset.volume24h >= 1e6
                          ? (convertFromRub(asset.volume24h) / 1e6).toFixed(2) + ' млн'
                          : asset.volume24h >= 1e3
                            ? (convertFromRub(asset.volume24h) / 1e3).toFixed(1) + 'k'
                            : formatPrice(asset.volume24h)}{' '}
                      {symbol}
                    </div>
                  </div>
                  <div className="min-w-[140px]">
                    <div className="text-[10px] text-textMuted uppercase font-bold">{t('min_deal')}</div>
                    <div className="text-xs text-textSecondary">
                      {formatPrice(MIN_DEAL_RUB)} {symbol}
                    </div>
                  </div>
                  <div className="min-w-[140px]">
                    <div className="text-[10px] text-textMuted uppercase font-bold">Provider</div>
                    <div className="text-xs text-neon">{provider}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* VIEW: ПРАВИЛА ТОРГОВЛИ */}
        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${
            isFullscreen ? 'opacity-0 z-0 pointer-events-none' : activeTab === 'RULES' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-neon/80" />
              <h2 className="text-base font-bold text-white">{t('rules_title')}</h2>
            </div>
            <div className="space-y-4 text-sm">
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-neon uppercase tracking-wider mb-2">Минимальная сделка</h3>
                <p className="text-neutral-400 leading-relaxed">
                  Минимальная сумма одной сделки — <span className="font-mono font-semibold text-white">{formatPrice(MIN_DEAL_RUB)} {symbol}</span>. Сумма выше минимальной может быть любой в пределах вашего баланса.
                </p>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-neon uppercase tracking-wider mb-2">Как работает сделка</h3>
                <p className="text-neutral-400 leading-relaxed mb-2">
                  Вы выбираете направление движения цены актива: <span className="text-up font-medium">Вверх</span> (Лонг) или <span className="text-down font-medium">Вниз</span> (Шорт), сумму ставки в рублях, плечо и время экспирации (10 сек, 30 сек, 1 мин или 5 мин).
                </p>
                <p className="text-neutral-400 leading-relaxed">
                  По истечении времени считается, насколько в процентах изменилась цена актива относительно точки входа. При движении в выбранную вами сторону вы получаете прибыль, приблизительно равную ставке × проценту изменения цены × плечо; при движении против — убыток. При сильном движении против с большим плечом сделка может быть полностью ликвидирована, и вы можете потерять всю сумму ставки.
                </p>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-neon uppercase tracking-wider mb-2">Плечо</h3>
                <p className="text-neutral-400 leading-relaxed">
                  Плечо от <span className="font-mono text-white">1x</span> до <span className="font-mono text-white">20x</span>. Чем выше плечо, тем сильнее влияние изменения цены на результат сделки. Выбор плеча не меняет сумму ставки — меняется только чувствительность к движению цены и риск ликвидации: при высоком плече даже небольшое движение против вас может привести к потере всей суммы сделки.
                </p>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-neon uppercase tracking-wider mb-2">Выплата при победе</h3>
                <p className="text-neutral-400 leading-relaxed">
                  При выигрышной сделке размер прибыли зависит от того, на сколько процентов изменился актив и какое плечо вы выбрали. Например, если вы поставили <span className="font-mono text-white">{formatPrice(1000)} {symbol}</span> с плечом <span className="font-mono text-white">x20</span>, а цена выросла на <span className="font-mono text-white">5%</span>, ваша прибыль составит около <span className="font-mono text-neon">+{formatPrice(1000)} {symbol}</span> (1000 × 5% × 20). Если же цена на те же 5% пойдёт против вас при большом плече, вы можете потерять всю сумму ставки.
                </p>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-neon uppercase tracking-wider mb-2">Подтверждение паролем</h3>
                <p className="text-neutral-400 leading-relaxed">
                  Для открытия сделки необходимо подтвердить действие паролем (PIN), заданным при первом входе. Это защищает ваш счёт от несанкционированных операций.
                </p>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-neon uppercase tracking-wider mb-2">Риски</h3>
                <p className="text-neutral-400 leading-relaxed">
                  Торговля криптоактивами связана с высоким риском. Цена может измениться в любую сторону. Не вкладывайте средства, потерю которых вы не можете позволить себе. Результат сделки определяется по цене актива на момент экспирации.
                </p>
              </section>
            </div>
          </div>
        </div>

        {/* VIEW: TRADE (Split Layout) — отступы: panel между блоками, table внутри стакана */}
        <div
          className={`absolute inset-0 flex flex-row transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isFullscreen ? 'opacity-0 z-0 pointer-events-none' : activeTab === 'TRADE' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
            
            {/* LEFT COLUMN: Controls (60%) — воздух в заголовках, блоки через gap-6 */}
            <div className="w-[60%] h-full flex flex-col p-4 border-r border-border overflow-y-auto no-scrollbar bg-background gap-4">
                {/* Фьючерсы / Спот (для Forex только фьючерсы) */}
                {!isForex && (
                  <div className="flex bg-card rounded-lg p-1 border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        Haptic.tap();
                        setTradeType('futures');
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tradeType === 'futures' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
                    >
                      {t('trade_type_futures')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        Haptic.tap();
                        setTradeType('spot');
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tradeType === 'spot' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
                    >
                      {t('trade_type_spot')}
                    </button>
                  </div>
                )}

                {/* SPOT: Купить / Продать — в стиле фьючерсов */}
                {tradeType === 'spot' && (
                    <div className="space-y-3">
                        {/* Направление: Купить / Продать */}
                        <div className="space-y-0.5">
                            <label className="text-[10px] text-neutral-500 uppercase font-bold">{t('direction')}</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => { Haptic.tap(); setSpotAction('buy'); }}
                                    className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all border
                                        ${spotAction === 'buy'
                                            ? 'bg-up/10 text-up border border-up'
                                            : 'bg-card text-textSecondary border-border hover:border-neutral-600'
                                        }`}
                                >
                                    {t('spot_buy')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { Haptic.tap(); setSpotAction('sell'); }}
                                    className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all border
                                        ${spotAction === 'sell'
                                            ? 'bg-down/10 text-down border border-down'
                                            : 'bg-card text-textSecondary border-border hover:border-neutral-600'
                                        }`}
                                >
                                    {t('spot_sell')}
                                </button>
                            </div>
                        </div>

                        {spotAction === 'buy' && (
                            <>
                                {/* Сумма в валюте */}
                                <div className="space-y-0.5">
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">
                                      {t('amount_label')} ({symbol})
                                    </label>
                                    <div className="bg-card border border-border rounded-lg px-3 py-1.5 flex items-center justify-between focus-within:border-neon transition-colors">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={spotAmount}
                                            onChange={(e) => setSpotAmount(e.target.value)}
                                            className="w-full bg-transparent text-white font-mono text-lg font-bold outline-none placeholder-neutral-700"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="text-[9px] text-neutral-600 px-1 flex items-center gap-2 flex-wrap">
                                        <span>{t('available')}: {formatPrice(balance)} {symbol}</span>
                                        <span className="flex items-center gap-0.5">
                                          <Info size={9} /> {t('min')}: {formatPrice(MIN_DEAL_RUB)} {symbol}
                                        </span>
                                    </div>
                                </div>
                                {/* Расчёт: получите ≈ X {ticker} */}
                                {livePrice > 0 && convertToRub(parseFloat(spotAmount.replace(',', '.')) || 0) >= MIN_DEAL_RUB && (
                                  <div className="rounded-lg border border-border bg-card px-2 py-1.5 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-neutral-500 uppercase font-bold">{t('you_receive')}</span>
                                    <span className="text-xs font-mono font-bold text-neon">
                                      ≈ {(() => {
                                        const displayAmount = parseFloat(spotAmount.replace(',', '.')) || 0;
                                        const base = livePrice > 0 ? convertToRub(displayAmount) / livePrice : 0;
                                        const value = base > 0 ? base.toFixed(8) : '0';
                                        return `${value} ${asset.ticker}`;
                                      })()}
                                    </span>
                                  </div>
                                )}
                                <p className="text-[9px] text-neutral-500 px-0.5 leading-tight">{t('spot_buy_note')}</p>
                                <button
                                    type="button"
                                    disabled={spotLoading || tradingBlocked || convertToRub(parseFloat(spotAmount.replace(',', '.')) || 0) < MIN_DEAL_RUB}
                                    onClick={() => { Haptic.tap(); setShowSpotConfirm('buy'); }}
                                    className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-neon text-black hover:opacity-90 hover-glow"
                                >
                                    {spotLoading ? '...' : t('spot_buy')}
                                </button>
                            </>
                        )}

                        {spotAction === 'sell' && (
                            <>
                                {/* Количество актива */}
                                <div className="space-y-0.5">
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">{asset.ticker} — {t('amount_label')}</label>
                                    <div className="bg-surface border border-neutral-800 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 focus-within:border-neon/50 transition-colors">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={spotQuantity}
                                            onChange={(e) => setSpotQuantity(e.target.value)}
                                            className="flex-1 bg-transparent text-white font-mono text-lg font-bold outline-none placeholder-neutral-700"
                                            placeholder="0"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { Haptic.tap(); setSpotQuantity(holdingAmount > 0 ? holdingAmount.toFixed(8) : '0'); }}
                                            className="px-2.5 py-1 rounded-md bg-card text-neon border border-neon text-xs font-mono font-bold hover:bg-surface active:scale-95"
                                        >
                                            Max
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                                            <button
                                                key={pct}
                                                type="button"
                                                onClick={() => {
                                                    Haptic.tap();
                                                    if (pct === 1) setSpotQuantity(holdingAmount > 0 ? holdingAmount.toFixed(8) : '0');
                                                    else setSpotQuantity(String((holdingAmount * pct).toFixed(8)));
                                                }}
                                                className="px-2.5 py-1 rounded-md bg-card text-textSecondary text-xs font-mono border border-border hover:bg-surface hover:text-textPrimary active:scale-95"
                                            >
                                                {pct === 1 ? 'Max' : (pct * 100) + '%'}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="text-[9px] text-neutral-600 px-1 flex items-center gap-2 flex-wrap">
                                        <span>{t('available')}: {holdingAmount.toFixed(8)} {asset.ticker}</span>
                                        {currentHolding && (
                                            <span className="text-neutral-500">
                                                ≈ {formatPrice(holdingAmount * currentHolding.avgPriceRub)} {symbol}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Расчёт: получите ≈ X {symbol} */}
                                {livePrice > 0 && parseFloat(spotQuantity) > 0 && parseFloat(spotQuantity) <= holdingAmount && (
                                    <div className="rounded-lg border border-border bg-card px-2 py-1.5 flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-neutral-500 uppercase font-bold">{t('you_receive')}</span>
                                        <span className="text-xs font-mono font-bold text-neon">
                                            ≈ {formatPrice((parseFloat(spotQuantity) || 0) * livePrice)} {symbol}
                                        </span>
                                    </div>
                                )}
                                <p className="text-[9px] text-neutral-500 px-0.5 leading-tight">{t('spot_sell_note')}</p>
                                <button
                                    type="button"
                                    disabled={spotLoading || tradingBlocked || holdingAmount <= 0 || (parseFloat(spotQuantity) || 0) <= 0}
                                    onClick={() => { Haptic.tap(); setShowSpotConfirm('sell'); }}
                                    className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-down text-white hover:opacity-90 hover-glow"
                                >
                                    {spotLoading ? '...' : t('spot_sell')}
                                </button>
                            </>
                        )}

                        {tradingBlocked && (
                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[10px]">
                                🔒 {t('trading_blocked')}.
                            </div>
                        )}
                        <p className="text-[9px] text-neutral-500 mt-1 px-0.5 leading-tight">{t('trading_risk_note')}</p>
                    </div>
                )}

                {/* FUTURES: сумма, плечо, время, Long/Short */}
                {tradeType === 'futures' && (
                <>
                {/* Inputs */}
                <div className="space-y-3">
                    
                    {/* Amount */}
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-neutral-500 uppercase font-bold">
                            {t('amount_label')} ({currencyCode})
                          </label>
                          <div className="bg-card border border-border rounded-lg px-3 py-1.5 flex items-center justify-between focus-within:border-neon transition-colors">
                            <input 
                              type="text"
                              inputMode="decimal"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              className="w-full bg-transparent text-white font-mono text-lg font-bold outline-none placeholder-neutral-700"
                              placeholder="0"
                            />
                          </div>
                          <div className="text-[9px] text-neutral-600 px-1 flex items-center gap-2 flex-wrap">
                            <span>{t('available')}: {formatPrice(balance)} {symbol}</span>
                            <span className="flex items-center gap-0.5">
                              <Info size={9} /> {t('min')}: {formatPrice(MIN_DEAL_RUB)} {symbol}
                            </span>
                          </div>
                        </div>

                    {/* Leverage */}
                    <div className="space-y-0.5">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-neutral-500 uppercase font-bold flex items-center">
                                <Zap size={10} className="mr-1 text-neon" /> {t('leverage')}
                            </label>
                            <span className="text-xs font-mono font-bold text-neon">x{leverage}</span>
                        </div>
                        <input 
                            type="range" 
                            min="1" 
                            max="20" 
                            step="1"
                            value={leverage}
                            onChange={(e) => { Haptic.tap(); setLeverage(parseInt(e.target.value)); }}
                            className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-neon"
                        />
                    </div>

                    {/* Duration */}
                    <div className="space-y-0.5">
                        <label className="text-[10px] text-neutral-500 uppercase font-bold flex items-center">
                            <Clock size={10} className="mr-1 text-neon" /> {t('time')}
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {TIMEFRAMES.map((tf) => (
                                <button
                                    key={tf.sec}
                                    onClick={() => { Haptic.tap(); setDuration(tf.sec); }}
                                    className={`py-1 rounded-md text-[10px] font-mono font-bold transition-all border
                                        ${duration === tf.sec 
                                            ? 'bg-neutral-800 text-white border-neon/50' 
                                            : 'bg-card text-textSecondary border-border'
                                        }
                                    `}
                                >
                                    {tf.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Side Toggle (Small Buttons) */}
                    <div className="space-y-0.5">
                         <label className="text-[10px] text-neutral-500 uppercase font-bold">{t('direction')}</label>
                         <div className="flex space-x-2">
                            <button 
                                onClick={() => { Haptic.tap(); setSide('UP'); }}
                                className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all border
                                    ${side === 'UP' 
                                        ? 'bg-up/10 text-up border border-up' 
                                        : 'bg-card text-textSecondary border-border hover:border-neutral-600'
                                    }
                                `}
                            >
                                {t('long')}
                            </button>
                            <button 
                                onClick={() => { Haptic.tap(); setSide('DOWN'); }}
                                className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all border
                                    ${side === 'DOWN' 
                                        ? 'bg-down/10 text-down border border-down' 
                                        : 'bg-card text-textSecondary border-border hover:border-neutral-600'
                                    }
                                `}
                            >
                                {t('short')}
                            </button>
                         </div>
                    </div>
                </div>

                {tradingBlocked && (
                  <div className="mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[10px]">
                    🔒 {t('trading_blocked')}.
                  </div>
                )}
                <p className="text-[9px] text-neutral-500 mt-1 px-0.5 leading-tight">{t('trading_risk_note')}</p>

                {/* Create Deal Button — сразу под настройками */}
                <button 
                    onClick={handlePreTrade}
                    disabled={tradingBlocked}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide shadow-lg active:scale-95 transition-all mt-3 hover-glow
                    ${tradingBlocked ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : side === 'UP' ? 'bg-neon text-black hover:opacity-90' : 'bg-down text-white hover:opacity-90'}`}
                >
                    {tradingBlocked ? t('trading_blocked') : t('create_deal')}
                </button>
                </>
                )}
            </div>

            {/* RIGHT COLUMN: Order Book (40%) — заголовок с воздухом, плотные строки, flash по центру */}
            <div className="w-[40%] flex flex-col bg-card border-l border-border/80">
                <div className="flex justify-between px-3 py-3 text-[9px] text-textSecondary uppercase tracking-wider border-b border-border">
                    <span>{t('order_book_price')}</span>
                    <span>{t('order_book_size')}</span>
                </div>
                
                {/* Asks (Red) — минимальные внутренние отступы (data density) */}
                <div className="flex flex-col-reverse justify-end flex-1 overflow-hidden pb-1 space-y-reverse space-y-[1px]">
                    {asks.map((ask, i) => (
                        <div key={`ask-${i}`} className="flex justify-between px-2 py-[2px] relative group cursor-pointer hover-row">
                            <span className="text-[10px] font-mono text-red-400 relative z-10">
                              {showAsFxQuote ? formatFxRateQuote(ask.price / rubPerUsd!) : formatPrice(ask.price)}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-500 relative z-10">{ask.size.toFixed(3)}</span>
                            <div className="absolute right-0 top-0 bottom-0 bg-red-500/10 z-0" style={{ width: `${Math.random() * 60}%` }}></div>
                        </div>
                    ))}
                </div>

                {/* Текущая цена + Flash effect (зелёный/красный затухание 300ms) */}
                <div
                  className={`py-2 border-y border-border flex flex-col items-center bg-background my-1 transition-colors duration-200 ${
                    flashDirection === 'up' ? 'animate-flash-up' : flashDirection === 'down' ? 'animate-flash-down' : ''
                  }`}
                >
                    <span className={`text-sm font-mono font-bold ${
                      priceDirection === 'up' ? 'text-up' : priceDirection === 'down' ? 'text-down' : 'text-white'
                    }`}>
                        {quoteUnavailable
                          ? '—'
                          : showAsFxQuote
                            ? formatFxRateQuote(
                                (orderBookBase > 0 ? orderBookBase : livePrice) / rubPerUsd!
                              )
                            : formatPrice(orderBookBase > 0 ? orderBookBase : livePrice)}
                    </span>
                    <span className="text-[8px] text-neutral-500">
                      {showAsFxQuote ? 'FX' : currencyCode}
                    </span>
                </div>

                {/* Bids (Green) */}
                <div className="flex flex-col flex-1 overflow-hidden pt-1 space-y-[1px]">
                     {bids.map((bid, i) => (
                        <div key={`bid-${i}`} className="flex justify-between px-2 py-[2px] relative group cursor-pointer hover-row">
                            <span className="text-[10px] font-mono text-green-400 relative z-10">
                              {showAsFxQuote ? formatFxRateQuote(bid.price / rubPerUsd!) : formatPrice(bid.price)}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-500 relative z-10">{bid.size.toFixed(3)}</span>
                            <div className="absolute right-0 top-0 bottom-0 bg-green-500/10 z-0" style={{ width: `${Math.random() * 60}%` }}></div>
                        </div>
                    ))}
                </div>
                
                {/* Order Book Footer */}
                 <div className="p-2 border-t border-border flex justify-center">
                    <ChevronDown size={14} className="text-neutral-600" />
                </div>
            </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      <BottomSheet
        open={!!showConfirm}
        onClose={() => { setShowConfirm(false); }}
        title={t('confirm_title')}
        closeOnBackdrop
      >
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('asset')}</span>
            <span className="font-bold text-textPrimary">{asset.ticker}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('direction')}</span>
            <span className={`font-bold ${side === 'UP' ? 'text-up' : 'text-down'}`}>
              {side === 'UP' ? `${t('long')} (${t('up')})` : `${t('short')} (${t('down')})`}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('amount_leverage')}</span>
            <div className="text-right">
              <span className="font-mono text-textPrimary block">
                {formatPrice(convertToRub(parseFloat(amount.replace(',', '.')) || 0))} {symbol} x{leverage}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('duration')}</span>
            <span className="font-mono text-textPrimary">{duration} {t('sec')}</span>
          </div>
        </div>
        <BottomSheetFooter
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => {
            const userId = tgid || webUserId?.toString();
            if (userId) {
              requirePin(userId, t('enter_pin_for_confirm'), handleConfirmTrade);
            } else {
              handleConfirmTrade();
            }
          }}
          confirmLabel={t('confirm')}
        />
      </BottomSheet>

      {/* SPOT CONFIRMATION MODAL */}
      <BottomSheet
        open={!!showSpotConfirm}
        onClose={() => setShowSpotConfirm(null)}
        title={
          showSpotConfirm === 'buy' ? `${t('confirm_title')} — ${t('spot_buy')}` : `${t('confirm_title')} — ${t('spot_sell')}`
        }
        closeOnBackdrop
      >
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('asset')}</span>
            <span className="font-bold text-textPrimary">{asset.ticker}</span>
          </div>
          {showSpotConfirm === 'buy' && (
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-textSecondary">{t('amount_label')}</span>
                <span className="font-mono text-textPrimary">
                  {formatPrice(convertToRub(parseFloat(spotAmount.replace(',', '.')) || 0))} {symbol}
                </span>
              </div>
              {livePrice > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('you_receive')}</span>
                  <span className="font-mono text-neon">
                    ≈ {(convertToRub(parseFloat(spotAmount.replace(',', '.')) || 0) / livePrice).toFixed(8)} {asset.ticker}
                  </span>
                </div>
              )}
            </>
          )}
          {showSpotConfirm === 'sell' && (
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-textSecondary">{asset.ticker} — {t('amount_label')}</span>
                <span className="font-mono text-textPrimary">{spotQuantity || '0'}</span>
              </div>
              {livePrice > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('you_receive')}</span>
                  <span className="font-mono text-neon">
                    ≈ {formatPrice((parseFloat(spotQuantity) || 0) * livePrice)} {symbol}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        <BottomSheetFooter
          onCancel={() => setShowSpotConfirm(null)}
          onConfirm={handleSpotConfirmWithPin}
          confirmLabel={t('confirm')}
          confirmLoading={spotLoading}
        />
      </BottomSheet>

      {/* SUCCESS ANIMATION OVERLAY */}
      {showSuccess && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          style={{ zIndex: Z_INDEX.modal }}
          role="dialog"
          aria-live="polite"
        >
          <div
            className="flex flex-col items-center px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-center h-24 w-24 rounded-full bg-up/20 mb-4 animate-deal-success">
              <div className="absolute inset-0 rounded-full border-2 border-up animate-ping opacity-20" />
              <CheckCircle2 size={52} className="text-up" strokeWidth={3} />
            </div>
            <h3 className="text-xl font-bold text-textPrimary tracking-wide">{t('deal_created')}</h3>
            <p className="text-textMuted mt-2 text-sm font-mono">{t('going_to_portfolio')}</p>
            <button
              type="button"
              onClick={() => {
                setShowSuccess(false);
                onBack();
              }}
              className="mt-6 px-6 py-3 rounded-xl bg-neon text-black font-bold active:scale-95"
            >
              {t('view_positions')}
            </button>
          </div>
        </div>
      )}

      {/* ASSET SEARCH OVERLAY */}
      {showAssetSearch && (
        <div className="fixed inset-0 z-[60] bg-background animate-fade-in">
          <div className="h-full w-full max-w-md mx-auto flex flex-col">
            <PageHeader
              title={t('search_pair')}
              onBack={() => {
                Haptic.tap();
                setShowAssetSearch(false);
              }}
            />
            <div className="flex-1 min-h-0">
              <CoinsPage
                onNavigateToTrading={(a) => {
                  Haptic.light();
                  onChangeAsset?.(a);
                  setShowAssetSearch(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TradingPage;