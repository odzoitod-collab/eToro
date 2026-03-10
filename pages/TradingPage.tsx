import React, { useRef, useState, useEffect } from 'react';
import { Asset, Deal } from '../types';
import { Clock, Zap, Check, X, ChevronDown, Info, BarChart3, FileText } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Haptic } from '../utils/haptics';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import { usePin } from '../context/PinContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebAuth } from '../context/WebAuthContext';
import { getTradingViewSymbol, getTradingViewSymbolLabel, getTradingViewChartUrl } from '../utils/chartSymbol';
import { fetchAssetPricesInRub } from '../lib/cryptoPrices';
import { spotBuy, spotSell } from '../lib/spot';
import type { SpotHolding } from '../types';
import CoinsPage from './CoinsPage';
import BottomSheet from '../components/BottomSheet';
import { Z_INDEX } from '../constants/zIndex';

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
  const { formatPrice, convertFromRub, convertToRub, symbol, currencyCode } = useCurrency();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('TRADE');
  const [tradeType, setTradeType] = useState<'futures' | 'spot'>(initialTradeType ?? 'futures');
  const [spotAction, setSpotAction] = useState<'buy' | 'sell'>(initialSpotAction ?? 'buy');
  const [spotAmountRub, setSpotAmountRub] = useState<string>('1000');
  const [spotQuantity, setSpotQuantity] = useState<string>('');
  const [spotLoading, setSpotLoading] = useState(false);
  const [leverage, setLeverage] = useState(10);
  const [amount, setAmount] = useState<string>('1000');
  const [duration, setDuration] = useState<number>(30);
  const [side, setSide] = useState<Side>('UP');
  const [livePrice, setLivePrice] = useState(asset?.price ?? 0);
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

  const [asks, setAsks] = useState<{price: number, size: number}[]>([]);
  const [bids, setBids] = useState<{price: number, size: number}[]>([]);
  const [orderBookBase, setOrderBookBase] = useState(0);

  const userIdNum = user?.user_id ?? (tgid ? Number(tgid) : webUserId ?? 0);
  const currentHolding = spotHoldings.find((h) => h.ticker === asset?.ticker);
  const holdingAmount = currentHolding?.amount ?? 0;

  useEffect(() => {
    if (initialTradeType) setTradeType(initialTradeType);
    if (initialSpotAction) setSpotAction(initialSpotAction);
    if (initialSpotAction === 'sell' && asset && currentHolding) {
      setSpotQuantity(String(currentHolding.amount));
    }
  }, [initialTradeType, initialSpotAction, asset?.ticker, currentHolding?.amount]);

  useEffect(() => { setChartLoaded(false); }, [asset?.ticker]);

  if (!asset) return <div className="p-10 text-center text-neutral-500">{t('asset_not_selected')}</div>;

  const quote = (currencyCode || 'USD').toUpperCase();
  const pairLabel = `${asset.ticker} ${quote}`;

  // Живая цена в шапке - обновляем из API каждые 10 секунд
  useEffect(() => {
    if (!asset) return;
    
    const updatePrice = async () => {
      try {
        const prices = await fetchAssetPricesInRub([asset.ticker]);
        if (prices[asset.ticker]) {
          const next = prices[asset.ticker].price;
          const prev = prevLivePriceRef.current;

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

  // Живой стакан: обновляем на основе реальной цены
  useEffect(() => {
    if (livePrice <= 0) return;
    
    setOrderBookBase(livePrice);
    const generate = (b: number, type: 'ask' | 'bid') =>
      Array.from({ length: 8 }).map((_, i) => {
        const diff = b * (0.0003 * (i + 1) + Math.random() * 0.0002);
        const price = type === 'ask' ? b + diff : b - diff;
        return { price, size: 0.5 + Math.random() * 2 };
      });
    setAsks(generate(livePrice, 'ask').reverse());
    setBids(generate(livePrice, 'bid'));
  }, [livePrice]);

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
      
      // Animation delay before actually creating deal and navigating
      setTimeout(() => {
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
          setShowSuccess(false);
      }, 1500);
  };

  const handleSpotBuy = async () => {
    if (!userIdNum || livePrice <= 0) return;
    const displayAmount = parseFloat(spotAmountRub.replace(',', '.')) || 0;
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
    <div className="flex flex-col h-full bg-background animate-fade-in relative overflow-hidden max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto">
      <PageHeader
        title={
          <button
            type="button"
            onClick={() => { Haptic.tap(); setShowAssetSearch(true); }}
            className="text-lg font-bold text-textPrimary tracking-wide hover:text-neon transition-colors active:scale-[0.99] text-left"
            aria-label={t('search_pair')}
          >
            {pairLabel}
          </button>
        }
        onBack={onBack}
        right={
          <span className={`text-sm font-mono font-bold ${priceDirection === 'up' ? 'text-up' : priceDirection === 'down' ? 'text-down' : 'text-textPrimary'}`}>
            {asset.priceUnavailable ? '—' : formatPrice(livePrice)} {symbol}
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

      {/* 3. Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* VIEW: CHART — график в стиле «минималистичный нео-нуар» */}
        <div className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${activeTab === 'CHART' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <div className="flex-1 flex flex-col min-h-0 p-4">
            {/* Контейнер: 12px скругление, 1px обводка, фон #131722, отступы 16px */}
            <div className="flex-1 min-h-[220px] w-full max-w-full rounded-card overflow-hidden border border-border bg-[#131722] relative">
              {/* Водяной знак: тикер актива 2–3% прозрачности */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden>
                <span className="text-[120px] font-bold text-white opacity-[0.025] tracking-tighter">
                  {asset.ticker}
                </span>
              </div>
              {/* Skeleton: силуэт кривой без размытия (плоская линия) */}
              {!chartLoaded && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                  <svg className="w-full h-full opacity-[0.04]" viewBox="0 0 400 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chart-skeleton-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00D09C" />
                        <stop offset="50%" stopColor="#00D09C" />
                        <stop offset="50%" stopColor="#FF4A68" />
                        <stop offset="100%" stopColor="#FF4A68" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,120 Q50,80 100,100 T200,60 T300,140 T400,90"
                      fill="none"
                      stroke="url(#chart-skeleton-grad)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              )}
              {/* График: плавное появление 0.6s после загрузки.
                  Примечание: предупреждения в консоли от виджета TradingView (paneProperties.vertGridColor /
                  horzGridColor, сообщения WebSocket) — внутренние для виджета, подавить их снаружи нельзя.
                  Не тратьте время на их отладку. */}
              <div className={`absolute inset-0 ${chartLoaded ? 'animate-chart-in' : 'opacity-0'}`}>
                <iframe
                  title={t('chart')}
                  className="w-full h-full rounded-card border-0"
                  src={getTradingViewChartUrl(getTradingViewSymbol(asset.ticker))}
                  scrolling="no"
                  style={{ border: 0 }}
                  onLoad={() => setChartLoaded(true)}
                />
              </div>
            </div>
            {/* Инфо об активе под графиком — отступ между блоками (block) */}
            <div className="mt-6 w-full rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={14} className="text-neon/80" />
                <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{t('rules_about_asset')}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-neutral-500">{t('asset')}</span>
                  <p className="font-semibold text-white truncate" title={asset.name}>{asset.name}</p>
                </div>
                <div>
                  <span className="text-neutral-500">{t('ticker')}</span>
                  <p className="font-mono font-bold text-neon">{getTradingViewSymbolLabel(asset.ticker)}</p>
                </div>
                <div>
                  <span className="text-neutral-500">{t('min_deal')}</span>
                  <p className="font-mono font-semibold text-white">{formatPrice(MIN_DEAL_RUB)} {symbol}</p>
                </div>
                <div>
                  <span className="text-neutral-500">{t('change_24h_val')}</span>
                  <p className={`font-mono font-semibold ${(asset.change24h ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                    {(asset.change24h ?? 0) >= 0 ? '+' : ''}{(asset.change24h ?? 0).toFixed(2)}%
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-neutral-500">{t('volume_24h')}</span>
                  <p className="font-mono text-neutral-300">
                    {asset.volume24h >= 1e9 ? (convertFromRub(asset.volume24h) / 1e9).toFixed(2) + ' млрд' : asset.volume24h >= 1e6 ? (convertFromRub(asset.volume24h) / 1e6).toFixed(2) + ' млн' : asset.volume24h >= 1e3 ? (convertFromRub(asset.volume24h) / 1e3).toFixed(1) + 'k' : formatPrice(asset.volume24h)} {symbol}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* VIEW: ПРАВИЛА ТОРГОВЛИ */}
        <div className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${activeTab === 'RULES' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-28">
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
        <div className={`absolute inset-0 flex flex-row transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${activeTab === 'TRADE' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            
            {/* LEFT COLUMN: Controls (60%) — воздух в заголовках, блоки через gap-6 */}
            <div className="w-[60%] h-full flex flex-col p-4 border-r border-border overflow-y-auto no-scrollbar bg-background gap-4">
                {/* Фьючерсы / Спот */}
                <div className="flex bg-card rounded-lg p-1 border border-border">
                    <button
                        type="button"
                        onClick={() => { Haptic.tap(); setTradeType('futures'); }}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tradeType === 'futures' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
                    >
                        {t('trade_type_futures')}
                    </button>
                    <button
                        type="button"
                        onClick={() => { Haptic.tap(); setTradeType('spot'); }}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tradeType === 'spot' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
                    >
                        {t('trade_type_spot')}
                    </button>
                </div>

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
                                            type="number"
                                            inputMode="decimal"
                                            value={spotAmountRub}
                                            onChange={(e) => setSpotAmountRub(e.target.value)}
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
                                {livePrice > 0 && parseFloat(spotAmountRub.replace(',', '.')) >= MIN_DEAL_RUB && (
                                  <div className="rounded-lg border border-border bg-card px-2 py-1.5 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-neutral-500 uppercase font-bold">{t('you_receive')}</span>
                                    <span className="text-xs font-mono font-bold text-neon">
                                      ≈ {(() => {
                                        const displayAmount = parseFloat(spotAmountRub.replace(',', '.')) || 0;
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
                                    disabled={spotLoading || tradingBlocked || (parseFloat(spotAmountRub) || 0) < MIN_DEAL_RUB}
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
                                            type="number"
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
                              type="number"
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
                            <span className="text-[10px] font-mono text-red-400 relative z-10">{formatPrice(ask.price)}</span>
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
                        {asset.priceUnavailable ? '—' : formatPrice(orderBookBase > 0 ? orderBookBase : livePrice)}
                    </span>
                    <span className="text-[8px] text-neutral-500">{currencyCode}</span>
                </div>

                {/* Bids (Green) */}
                <div className="flex flex-col flex-1 overflow-hidden pt-1 space-y-[1px]">
                     {bids.map((bid, i) => (
                        <div key={`bid-${i}`} className="flex justify-between px-2 py-[2px] relative group cursor-pointer hover-row">
                            <span className="text-[10px] font-mono text-green-400 relative z-10">{formatPrice(bid.price)}</span>
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
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={() => { Haptic.tap(); setShowConfirm(false); }}
            className="flex-1 py-3 rounded-xl bg-neutral-800 text-textPrimary font-medium active:scale-[0.98] transition-etoro"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              const userId = tgid || webUserId?.toString();
              if (userId) {
                requirePin(userId, t('enter_pin_for_confirm'), handleConfirmTrade);
              } else {
                handleConfirmTrade();
              }
            }}
            className="flex-1 py-3 rounded-xl bg-neon text-black font-bold active:scale-[0.98] transition-etoro hover-glow"
          >
            {t('confirm')}
          </button>
        </div>
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
                  {formatPrice(convertToRub(parseFloat(spotAmountRub.replace(',', '.')) || 0))} {symbol}
                </span>
              </div>
              {livePrice > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('you_receive')}</span>
                  <span className="font-mono text-neon">
                    ≈ {(convertToRub(parseFloat(spotAmountRub.replace(',', '.')) || 0) / livePrice).toFixed(8)} {asset.ticker}
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
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={() => { Haptic.tap(); setShowSpotConfirm(null); }}
            className="flex-1 py-3 rounded-xl bg-neutral-800 text-textPrimary font-medium active:scale-[0.98] transition-etoro"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              handleSpotConfirmWithPin();
            }}
            disabled={spotLoading}
            className="flex-1 py-3 rounded-xl bg-neon text-black font-bold active:scale-95 transition-transform disabled:opacity-50 hover-glow"
          >
            {spotLoading ? '...' : t('confirm')}
          </button>
        </div>
      </BottomSheet>

      {/* SUCCESS ANIMATION OVERLAY */}
      {showSuccess && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          style={{ zIndex: Z_INDEX.modal }}
          onClick={() => setShowSuccess(false)}
          role="dialog"
          aria-live="polite"
        >
          <div
            className="flex flex-col items-center px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-center h-24 w-24 rounded-full bg-up/20 mb-4 animate-scale-in">
              <div className="absolute inset-0 rounded-full border-2 border-up animate-ping opacity-20" />
              <Check size={48} className="text-up animate-check-stroke" strokeWidth={3} />
            </div>
            <h3 className="text-xl font-bold text-textPrimary tracking-wide">{t('deal_created')}</h3>
            <p className="text-textMuted mt-2 text-sm font-mono">{t('going_to_portfolio')}</p>
            <button
              type="button"
              onClick={() => setShowSuccess(false)}
              className="mt-6 px-6 py-3 rounded-xl bg-neon text-black font-bold active:scale-95"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ASSET SEARCH OVERLAY */}
      {showAssetSearch && (
        <div className="fixed inset-0 z-[60] bg-background animate-fade-in">
          <div className="h-full w-full max-w-md mx-auto relative">
            <button
              type="button"
              onClick={() => { Haptic.tap(); setShowAssetSearch(false); }}
              className="fixed top-3 right-3 z-[80] w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform"
              aria-label={t('close')}
            >
              <X size={18} />
            </button>

            <div className="h-full">
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