import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ArrowLeftRight, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { Haptic } from '../utils/haptics';
import { useLiveAssets } from '../utils/useLiveAssets';
import { MARKET_ASSETS } from '../constants';
import { spotBuy, spotSell } from '../lib/spot';
import { useToast } from '../context/ToastContext';
import ExchangeAssetPicker, { type ExchangeSide } from '../components/ExchangeAssetPicker';
import type { SpotHolding } from '../types';

const MIN_EXCHANGE_RUB = 100;

interface ExchangePageProps {
  spotHoldings: SpotHolding[];
  refreshSpotHoldings: () => Promise<void>;
  onPickerOpenChange?: (open: boolean) => void;
}

const ExchangePage: React.FC<ExchangePageProps> = ({
  spotHoldings,
  refreshSpotHoldings,
  onPickerOpenChange,
}) => {
  const { t } = useLanguage();
  const { formatPrice, symbol, convertToRub, convertFromRub, currencyCode } = useCurrency();
  const { user, refreshUser } = useUser();
  const toast = useToast();
  const liveAssets = useLiveAssets(MARKET_ASSETS);

  const [fromSide, setFromSide] = useState<ExchangeSide>('currency');
  const [toSide, setToSide] = useState<ExchangeSide>('BTC');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [pickerMode, setPickerMode] = useState<'from' | 'to' | null>(null);

  const openPicker = (mode: 'from' | 'to') => {
    setPickerMode(mode);
    onPickerOpenChange?.(true);
  };
  const closePicker = () => {
    setPickerMode(null);
    onPickerOpenChange?.(false);
  };

  const balanceRub = user?.balance ?? 0;
  const assetFrom =
    fromSide === 'currency'
      ? null
      : liveAssets.find((a) => a.ticker === fromSide) ?? MARKET_ASSETS.find((a) => a.ticker === fromSide);
  const assetTo =
    toSide === 'currency'
      ? null
      : liveAssets.find((a) => a.ticker === toSide) ?? MARKET_ASSETS.find((a) => a.ticker === toSide);
  const priceFromRub = fromSide === 'currency' ? 0 : (assetFrom?.price ?? 0);
  const priceToRub = toSide === 'currency' ? 0 : (assetTo?.price ?? 0);
  const holdingFrom = fromSide === 'currency' ? null : spotHoldings.find((h) => h.ticker === fromSide);
  const fromAmount = fromSide === 'currency' ? 0 : (holdingFrom?.amount ?? 0);

  const normalizedAmount = amount.replace(',', '.');
  const numAmount = parseFloat(normalizedAmount) || 0;

  const isFromCurrency = fromSide === 'currency';
  const isToCurrency = toSide === 'currency';

  const amountInRub = isFromCurrency ? convertToRub(numAmount) : numAmount * priceFromRub;
  const resultQuantity =
    isToCurrency ? (priceToRub > 0 ? amountInRub / priceToRub : 0) : priceToRub > 0 ? amountInRub / priceToRub : 0;
  const resultInCurrency = amountInRub;
  const resultInCrypto = resultQuantity;

  const canSubmit =
    fromSide !== toSide &&
    numAmount > 0 &&
    Number.isFinite(amountInRub) &&
    amountInRub >= MIN_EXCHANGE_RUB &&
    (isFromCurrency
      ? balanceRub >= convertToRub(numAmount) && (isToCurrency || priceToRub > 0)
      : fromAmount >= numAmount && priceFromRub > 0 && (isToCurrency || priceToRub > 0));

  const amountPresetsRub = useMemo(
    () =>
      [...new Set([MIN_EXCHANGE_RUB, 1000, 5000, Math.floor(balanceRub * 0.5), balanceRub])]
        .filter((v) => v >= MIN_EXCHANGE_RUB && v > 0)
        .sort((a, b) => a - b)
        .slice(0, 4),
    [balanceRub]
  );

  const sanitizeDecimalInput = (raw: string) => {
    const cleaned = raw.replace(',', '.').replace(/[^0-9.]/g, '');
    const [intPart, ...rest] = cleaned.split('.');
    const fraction = rest.join('');
    return rest.length > 0 ? `${intPart}.${fraction}` : intPart;
  };

  useEffect(() => {
    setAmount('');
  }, [fromSide]);

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    Haptic.tap();
    setLoading(true);
    try {
      if (isFromCurrency && !isToCurrency) {
        const amountRub = convertToRub(numAmount);
        if (amountRub <= 0 || amountRub > balanceRub) {
          toast.show(t('exchange_insufficient_balance'), 'error');
          setLoading(false);
          return;
        }
        const res = await spotBuy(user.user_id, toSide as string, amountRub, priceToRub);
        if (res.ok) {
          toast.show(t('exchange_success'), 'success');
          setAmount('');
          await Promise.all([refreshSpotHoldings(), refreshUser()]);
          Haptic.success();
        } else {
          toast.show(res.error ?? t('exchange_insufficient_balance'), 'error');
          Haptic.error();
        }
      } else if (!isFromCurrency && isToCurrency) {
        if (numAmount <= 0 || numAmount > fromAmount) {
          toast.show(t('exchange_insufficient_balance'), 'error');
          setLoading(false);
          return;
        }
        const res = await spotSell(user.user_id, fromSide as string, numAmount, priceFromRub);
        if (res.ok) {
          toast.show(t('exchange_success'), 'success');
          setAmount('');
          await Promise.all([refreshSpotHoldings(), refreshUser()]);
          Haptic.success();
        } else {
          toast.show(res.error ?? t('exchange_insufficient_balance'), 'error');
          Haptic.error();
        }
      } else if (!isFromCurrency && !isToCurrency) {
        if (numAmount <= 0 || numAmount > fromAmount || fromSide === toSide) {
          toast.show(t('exchange_insufficient_balance'), 'error');
          setLoading(false);
          return;
        }
        const sellRes = await spotSell(user.user_id, fromSide as string, numAmount, priceFromRub);
        if (!sellRes.ok || sellRes.amount_rub == null) {
          toast.show(sellRes.error ?? t('exchange_insufficient_balance'), 'error');
          Haptic.error();
          setLoading(false);
          return;
        }
        const buyRes = await spotBuy(user.user_id, toSide as string, sellRes.amount_rub, priceToRub);
        if (buyRes.ok) {
          toast.show(t('exchange_success'), 'success');
          setAmount('');
          await Promise.all([refreshSpotHoldings(), refreshUser()]);
          Haptic.success();
        } else {
          toast.show(buyRes.error ?? t('exchange_insufficient_balance'), 'error');
          Haptic.error();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fromLabel = isFromCurrency ? symbol : fromSide;
  const toLabel = isToCurrency ? symbol : toSide;
  const fromSub = isFromCurrency
    ? `${formatPrice(balanceRub)} ${symbol}`
    : holdingFrom
      ? `${fromAmount.toFixed(6)} ${fromSide}`
      : null;
  const resultText = isToCurrency
    ? `≈ ${formatPrice(resultInCurrency)} ${symbol}`
    : `≈ ${resultInCrypto.toFixed(8)} ${toSide}`;

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in">
      {/* Шапка в стиле биржи */}
      <header className="shrink-0 px-4 pt-4 pb-3 border-b border-border bg-background min-h-[48px]">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center text-neon">
            <ArrowLeftRight size={18} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-textPrimary tracking-tight">{t('exchange_title')}</h1>
            <p className="text-[11px] text-textMuted mt-0.5">
              {t('exchange_min_amount', { amount: `${formatPrice(MIN_EXCHANGE_RUB)} ${symbol}` })}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        <div className="max-w-2xl w-full mx-auto space-y-4">
          {/* Карточка: Отдаю */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-surface/80">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                {t('from_label')}
              </p>
            </div>
            <div className="p-3 space-y-3">
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  openPicker('from');
                }}
                className="touch-target w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-surface border border-border hover:border-neon/40 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold text-sm text-textPrimary truncate">{fromLabel}</p>
                  {fromSub && (
                    <p className="text-[11px] font-mono text-textMuted truncate mt-0.5">{fromSub}</p>
                  )}
                </div>
                <ChevronDown size={16} className="text-textMuted flex-shrink-0" />
              </button>
              <input
                type="text"
                inputMode="decimal"
                placeholder={isFromCurrency ? `0 ${symbol}` : '0'}
                value={amount}
                onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-textPrimary font-mono text-sm placeholder:text-textMuted focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/20 transition-colors"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-mono text-textMuted">
                  {t('exchange_min_amount', { amount: `${formatPrice(MIN_EXCHANGE_RUB)} ${symbol}` })}
                </p>
                {isFromCurrency && amountPresetsRub.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {amountPresetsRub.map((presetRub) => {
                      const presetDisplay = convertFromRub(presetRub);
                      return (
                        <button
                          key={presetRub}
                          type="button"
                          onClick={() => {
                            Haptic.tap();
                            setAmount(String(presetDisplay));
                          }}
                          className="text-[10px] font-mono text-neon hover:underline active:scale-95"
                        >
                          {formatPrice(presetRub)} {symbol}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!isFromCurrency && fromAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      Haptic.tap();
                      setAmount(String(fromAmount));
                    }}
                    className="text-[10px] font-mono text-neon hover:underline active:scale-95"
                  >
                    {t('exchange_max')}: {fromAmount.toFixed(6)}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Карточка: Получаю */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-surface/80">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                {t('to_label')}
              </p>
            </div>
            <div className="p-3">
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  openPicker('to');
                }}
                className="touch-target w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-surface border border-border hover:border-neon/40 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold text-sm text-textPrimary truncate">{toLabel}</p>
                  {!isToCurrency && assetTo && (
                    <p className="text-[11px] font-mono text-textMuted truncate mt-0.5">
                      {assetTo.priceUnavailable ? '—' : `${formatPrice(assetTo.price)} ${symbol}`}
                    </p>
                  )}
                </div>
                <ChevronDown size={16} className="text-textMuted flex-shrink-0" />
              </button>
              {amount && numAmount > 0 && (
                <p className="mt-3 text-sm font-mono font-bold text-neon">
                  {resultText}
                  {isToCurrency && <span className="text-textMuted font-normal ml-2">({currencyCode})</span>}
                </p>
              )}
            </div>
          </div>

          {/* Кнопка обмена */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="w-full touch-target min-h-[48px] py-3 rounded-xl bg-neon text-black font-bold text-sm disabled:opacity-70 disabled:pointer-events-none active:scale-[0.98] transition-all hover-glow flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin shrink-0" />
              </>
            ) : (
              <span>{t('exchange_btn')}</span>
            )}
          </button>

          {!user && (
            <p className="text-center text-[11px] text-textMuted py-2">
              {t('exchange_login_hint')}
            </p>
          )}
        </div>
      </div>

      <ExchangeAssetPicker
        open={pickerMode !== null}
        title={pickerMode === 'from' ? t('exchange_picker_from') : t('exchange_picker_to')}
        mode={pickerMode ?? 'to'}
        selected={pickerMode === 'from' ? fromSide : toSide}
        exclude={pickerMode === 'from' ? toSide : fromSide}
        spotHoldings={spotHoldings}
        balanceRub={balanceRub}
        onSelect={pickerMode === 'from' ? setFromSide : setToSide}
        onClose={closePicker}
      />
    </div>
  );
};

export default ExchangePage;
