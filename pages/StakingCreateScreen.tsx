import React, { useState, useEffect } from 'react';
import { TrendingUp, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Z_INDEX } from '../constants/zIndex';
import { useLanguage } from '../context/LanguageContext';
import { Haptic } from '../utils/haptics';
import { stake } from '../lib/staking';
import BottomSheetFooter from '../components/BottomSheetFooter';

interface StakingCreateScreenProps {
  ticker: string;
  maxAmount: number;
  ratePerMonth: number;
  userId: number;
  pinUserId: string;
  requirePin: (userId: string, message: string, callback: () => void) => void;
  onClose: () => void;
  onSuccess: (ticker: string, amount: number) => void;
  onError: (msg: string) => void;
}

const StakingCreateScreen: React.FC<StakingCreateScreenProps> = ({
  ticker,
  maxAmount,
  ratePerMonth,
  userId,
  pinUserId,
  requirePin,
  onClose,
  onSuccess,
  onError,
}) => {
  const { t } = useLanguage();
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [loading, setLoading] = useState(false);

  // Лочим скролл фона, пока открыт экран стейкинга
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const pct = Math.round(ratePerMonth * 100);
  const numAmount = parseFloat(amount.replace(',', '.')) || 0;
  const isValid = !isNaN(numAmount) && numAmount > 0 && numAmount <= maxAmount;

  const handleConfirm = () => {
    if (!isValid) {
      onError(t('insufficient_spot') || 'Invalid amount');
      return;
    }
    Haptic.tap();
    setStep('confirm');
  };

  const handleCreateStaking = () => {
    if (!isValid) return;
    Haptic.tap();
    requirePin(pinUserId, t('enter_pin_for_confirm'), async () => {
      setLoading(true);
      const res = await stake(userId, ticker, numAmount);
      setLoading(false);
      if (res.ok) {
        Haptic.success();
        onSuccess(ticker, numAmount);
        onClose();
      } else {
        onError(res.error || t('deal_creation_error'));
        Haptic.error();
      }
    });
  };

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-0 sm:p-4"
      style={{ zIndex: Z_INDEX.modal }}
      onClick={(e) => { if (e.target === e.currentTarget) { Haptic.light(); onClose(); } }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-background rounded-t-2xl sm:rounded-2xl border border-border flex flex-col max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <PageHeader
          title={`${t('stake_screen_title')} · ${ticker}`}
          onBack={step === 'confirm' ? () => setStep('input') : onClose}
        />
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-6">
        {step === 'input' ? (
          <>
            <div className="rounded-xl border border-white/10 bg-surface p-4 mb-4">
              <div className="flex items-start gap-2">
                <Info size={18} className="text-neon flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-neutral-300 leading-snug">
                    {t('staking_what_is')}
                  </p>
                  <p className="text-xs text-neutral-500 mt-2 font-mono">
                    ~{pct}% / {t('duration')?.toLowerCase() || 'month'} · {t('staking_desc', { pct: String(pct) })}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-neutral-500 mb-1.5">
              {t('available')}: <span className="font-mono text-neutral-300">{maxAmount.toFixed(8)} {ticker}</span>
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder={t('stake_quantity_placeholder')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl bg-surface border border-neutral-800 text-white font-mono text-base focus:outline-none focus:border-neon/50"
              />
              <button
                type="button"
                onClick={() => { Haptic.tap(); setAmount(maxAmount > 0 ? String(maxAmount) : ''); }}
                className="px-4 py-3 rounded-xl border border-neon/50 text-neon font-mono font-semibold text-sm active:scale-95"
              >
                Max
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 mb-6">
              {t('staking_desc', { pct: String(pct) })}
            </p>

            <button
              type="button"
              disabled={!isValid || loading}
              onClick={handleConfirm}
              className="w-full py-3.5 rounded-xl bg-neon text-black font-bold text-sm uppercase tracking-wide active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('stake_confirm_step')}
            </button>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-neon/30 bg-neon/5 p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={20} className="text-neon" />
                <span className="text-sm font-mono text-white font-semibold">{t('stake_confirm_step')}</span>
              </div>
              <p className="text-sm text-neutral-300 leading-snug">
                {t('stake_confirm_summary', { amount: numAmount.toFixed(8), ticker, pct: String(pct) })}
              </p>
            </div>

            <BottomSheetFooter
              onCancel={() => {
                Haptic.tap();
                setStep('input');
              }}
              onConfirm={handleCreateStaking}
              confirmLabel={t('create_staking_btn')}
              confirmLoading={loading}
            />
          </>
        )}
        </div>
      </div>
    </div>
  );
};

export default StakingCreateScreen;
