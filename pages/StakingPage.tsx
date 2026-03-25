import React, { useMemo, useState } from 'react';
import { Gem, Info, TrendingUp } from 'lucide-react';
import type { SpotHolding, StakingPosition, StakingRate } from '../types';
import type { Asset } from '../types';
import { MARKET_ASSETS } from '../constants';
import { useLiveAssets } from '../utils/useLiveAssets';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { usePin } from '../context/PinContext';
import { useUser } from '../context/UserContext';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';
import { Haptic } from '../utils/haptics';
import { unstake } from '../lib/staking';
import StakingCreateScreen from './StakingCreateScreen';
import BottomSheet from '../components/BottomSheet';
import BottomSheetFooter from '../components/BottomSheetFooter';
import {
  APP_TOP_BAR_CLASS,
  APP_TOP_BAR_ROW,
  APP_TOP_BAR_STYLE,
  APP_TOP_BAR_SUBTITLE_CLASS,
  APP_TOP_BAR_TITLE_CLASS,
} from '../components/appTopBar';

const STAKING_TICKERS = ['BTC', 'ETH', 'SOL', 'TON', 'BNB', 'ADA', 'XRP'];

interface StakingPageProps {
  spotHoldings: SpotHolding[];
  stakingPositions: StakingPosition[];
  stakingRates: StakingRate[];
  refreshStaking: () => Promise<void>;
  userId: number;
  onNavigateToTrading: (asset: Asset, options?: { tradeType?: 'futures' | 'spot'; spotAction?: 'buy' | 'sell' }) => void;
}

const StakingPage: React.FC<StakingPageProps> = ({
  spotHoldings,
  stakingPositions,
  stakingRates,
  refreshStaking,
  userId,
  onNavigateToTrading,
}) => {
  const { t } = useLanguage();
  const { symbol } = useCurrency();
  const toast = useToast();
  const { requirePin } = usePin();
  const { tgid } = useUser();
  const { webUserId } = useWebAuth();
  const pinUserId = String(tgid ?? webUserId ?? '');
  const liveMarket = useLiveAssets(MARKET_ASSETS);

  const [stakeScreen, setStakeScreen] = useState<{ ticker: string; maxAmount: number; ratePerMonth: number } | null>(null);
  const [unstakeTicker, setUnstakeTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rateByTicker = useMemo(() => {
    const map: Record<string, StakingRate> = {};
    stakingRates.forEach((rate) => {
      map[rate.ticker] = rate;
    });
    return map;
  }, [stakingRates]);

  const spotByTicker = useMemo(() => {
    const map: Record<string, SpotHolding> = {};
    spotHoldings.forEach((holding) => {
      map[holding.ticker] = holding;
    });
    return map;
  }, [spotHoldings]);

  const availableTickers = useMemo(() => {
    const marketSet = new Set(liveMarket.map((asset) => asset.ticker));
    return STAKING_TICKERS.filter((ticker) => marketSet.has(ticker));
  }, [liveMarket]);

  const totalStaked = useMemo(
    () => stakingPositions.reduce((sum, position) => sum + position.amount, 0),
    [stakingPositions]
  );

  const totalStakedValue = useMemo(
    () =>
      stakingPositions.reduce((sum, position) => {
        const asset = liveMarket.find((item) => item.ticker === position.ticker);
        return sum + (asset?.price ?? 0) * position.amount;
      }, 0),
    [stakingPositions, liveMarket]
  );

  const handleOpenStake = (ticker: string) => {
    const holding = spotByTicker[ticker];
    const maxAmount = holding?.amount ?? 0;
    if (maxAmount <= 0) {
      const asset = liveMarket.find((item) => item.ticker === ticker);
      if (asset) onNavigateToTrading(asset, { tradeType: 'spot', spotAction: 'buy' });
      return;
    }
    const rate = rateByTicker[ticker];
    Haptic.tap();
    setStakeScreen({ ticker, maxAmount, ratePerMonth: rate?.ratePerMonth ?? 0.13 });
  };

  const handleUnstake = async (ticker: string) => {
    if (userId <= 0) return;
    const asset = liveMarket.find((item) => item.ticker === ticker);
    const priceRub = asset?.price ?? 0;
    if (priceRub <= 0) {
      toast.show('Price unknown', 'error');
      return;
    }
    setLoading(true);
    const res = await unstake(userId, ticker, priceRub);
    setLoading(false);
    setUnstakeTicker(null);
    if (res.ok) {
      await refreshStaking();
      Haptic.success();
      toast.show(`${t('unstake_btn')} OK`, 'success');
    } else {
      Haptic.error();
      toast.show(res.error || 'Error', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in">
      <header className={APP_TOP_BAR_CLASS} style={APP_TOP_BAR_STYLE}>
        <div className={`${APP_TOP_BAR_ROW} max-w-2xl mx-auto`}>
          <div className="h-10 w-10 rounded-xl bg-surface flex items-center justify-center text-neon shrink-0">
            <Gem size={20} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={APP_TOP_BAR_TITLE_CLASS}>{t('staking_title')}</h1>
            <p className={APP_TOP_BAR_SUBTITLE_CLASS}>{t('staking_rewards_to_balance')}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-32">
        <div className="max-w-2xl w-full mx-auto">
        <div className="rounded-2xl border border-neon/20 bg-gradient-to-br from-card via-surface to-card overflow-hidden mb-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="p-3 border-b border-white/5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neon">
              <TrendingUp size={12} className="text-neon" />
              {t('special_offer')} · {t('staking_title')}
            </span>
            <span className="text-[10px] text-neutral-500">{availableTickers.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 py-2 border-b border-white/5">
            <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wide">{t('my_staking')}</p>
              <p className="text-sm font-mono font-semibold text-white mt-0.5">{totalStaked.toFixed(4)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2 text-right">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wide">{t('total_balance')}</p>
              <p className="text-sm font-mono font-semibold text-neon mt-0.5">
                ≈ {totalStakedValue.toFixed(0)} {symbol}
              </p>
            </div>
          </div>
          <div className="p-3 border-b border-white/5 flex items-start gap-2">
            <Info size={14} className="text-neon flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-neutral-400 leading-snug">{t('staking_what_is')}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] text-neutral-500 leading-snug">{t('staking_rewards_to_balance')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
          {availableTickers.map((ticker) => {
            const rate = rateByTicker[ticker];
            const spot = spotByTicker[ticker];
            const position = stakingPositions.find((p) => p.ticker === ticker);
            const pct = rate ? Math.round(rate.ratePerMonth * 100) : 13;
            const hasSpot = (spot?.amount ?? 0) > 0;
            return (
              <button
                key={ticker}
                type="button"
                onClick={() => handleOpenStake(ticker)}
                className="touch-target group text-left rounded-xl border border-border bg-card p-3 hover:border-neon/50 hover:bg-surface/80 active:scale-[0.99] transition-all min-h-[120px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-white group-hover:text-neon transition-colors">{ticker}</span>
                  <span className="text-[10px] font-mono text-neon rounded-md bg-neon/10 border border-neon/20 px-1.5 py-1 leading-none">~{pct}%</span>
                </div>
                <p className="mt-2 text-[10px] text-neutral-500 leading-snug">
                  {hasSpot ? `${t('available')}: ${(spot?.amount ?? 0).toFixed(6)} ${ticker}` : t('insufficient_spot')}
                </p>
                {position && (
                  <p className="mt-1 text-[10px] text-neutral-400 leading-snug">
                    {t('my_staking')}: {position.amount.toFixed(6)} {ticker}
                  </p>
                )}
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className={`text-[10px] ${hasSpot ? 'text-neon' : 'text-neutral-400'}`}>{hasSpot ? t('stake_btn') : t('spot_buy')}</span>
                  <span className="text-[10px] font-mono text-neon">{hasSpot ? '→' : '+'}</span>
                </div>
              </button>
            );
          })}
        </div>

        {stakingPositions.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">{t('my_staking')}</p>
              <p className="text-[10px] text-neutral-500 font-mono">{stakingPositions.length}</p>
            </div>
            {stakingPositions.map((position) => {
              const asset = liveMarket.find((item) => item.ticker === position.ticker);
              const amountRub = (asset?.price ?? 0) * position.amount;
              return (
                <div key={position.ticker} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 min-h-[56px]">
                  <div>
                    <p className="text-xs font-mono text-white">{position.ticker}</p>
                    <p className="text-[10px] text-neutral-500">
                      {position.amount.toFixed(8)} {position.ticker} · ≈ {amountRub.toFixed(0)} {symbol}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      Haptic.tap();
                      setUnstakeTicker(position.ticker);
                    }}
                    className="touch-target px-2.5 py-1.5 rounded-lg border border-red-500/40 text-[10px] font-medium text-red-300 hover:bg-red-500/10 active:scale-[0.98] transition-all"
                  >
                    {t('unstake_btn')}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card/60 p-4 text-center">
            <p className="text-xs text-neutral-500">{t('no_staking')}</p>
          </div>
        )}
      </div>
      </div>

      {stakeScreen && pinUserId && (
        <StakingCreateScreen
          ticker={stakeScreen.ticker}
          maxAmount={stakeScreen.maxAmount}
          ratePerMonth={stakeScreen.ratePerMonth}
          userId={userId}
          pinUserId={pinUserId}
          requirePin={requirePin}
          onClose={() => setStakeScreen(null)}
          onSuccess={() => {
            refreshStaking();
          }}
          onError={(msg) => toast.show(msg, 'error')}
        />
      )}

      {unstakeTicker != null && (() => {
        const pos = stakingPositions.find((p) => p.ticker === unstakeTicker);
        const amount = pos?.amount ?? 0;
        return (
          <BottomSheet open onClose={() => setUnstakeTicker(null)} title={t('unstake_modal_title')} closeOnBackdrop>
            <p className="text-xs text-textMuted mb-3">
              {unstakeTicker} · {t('unstake_you_receive')}:
            </p>
            <div className="rounded-xl bg-surface border border-border p-3 mb-4">
              <p className="text-lg font-mono font-bold text-neon">
                {amount.toFixed(8)} {unstakeTicker}
              </p>
            </div>
            <p className="text-[10px] text-textMuted mb-4">{t('unstake_principal_only')}</p>
            <BottomSheetFooter
              onCancel={() => {
                Haptic.tap();
                setUnstakeTicker(null);
              }}
              onConfirm={() => {
                if (pinUserId) {
                  requirePin(pinUserId, t('enter_pin_for_confirm'), () => handleUnstake(unstakeTicker));
                } else {
                  handleUnstake(unstakeTicker);
                }
              }}
              confirmLabel={t('confirm')}
              confirmLoading={loading}
              variant="destructive"
            />
          </BottomSheet>
        );
      })()}
    </div>
  );
};

export default StakingPage;
