import React, { useState, useMemo, useEffect } from 'react';
import AssetTable, { FilterType } from '../components/AssetTable';
import { MARKET_ASSETS } from '../constants';
import { Asset, AssetCategory } from '../types';
import type { SpotHolding, StakingPosition, StakingRate } from '../types';
import { Search, TrendingUp, Info } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { usePin } from '../context/PinContext';
import { useUser } from '../context/UserContext';
import { useWebAuth } from '../context/WebAuthContext';
import { Haptic } from '../utils/haptics';
import { useLiveAssets } from '../utils/useLiveAssets';
import { stake, unstake } from '../lib/staking';
import { useToast } from '../context/ToastContext';
import StakingCreateScreen from './StakingCreateScreen';
import BottomSheet from '../components/BottomSheet';

const STAKING_TICKERS = ['BTC', 'ETH', 'SOL'];

interface CoinsPageProps {
  onNavigateToTrading: (asset: Asset, options?: { tradeType?: 'futures' | 'spot'; spotAction?: 'buy' | 'sell' }) => void;
  spotHoldings: SpotHolding[];
  stakingPositions: StakingPosition[];
  stakingRates: StakingRate[];
  refreshSpotHoldings: () => Promise<void>;
  refreshStaking: () => Promise<void>;
  userId: number;
  onReferralStake?: (ticker: string, amount: number) => void;
  onUnstakeModalChange?: (open: boolean) => void;
}

const CoinsPage: React.FC<CoinsPageProps> = ({
  onNavigateToTrading,
  spotHoldings,
  stakingPositions = [],
  stakingRates = [],
  refreshSpotHoldings,
  refreshStaking,
  userId,
  onReferralStake,
  onUnstakeModalChange,
}) => {
  const { t } = useLanguage();
  const { symbol, formatPrice } = useCurrency();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('Top');
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | AssetCategory>('all');
  const [stakeScreen, setStakeScreen] = useState<{ ticker: string; maxAmount: number; ratePerMonth: number } | null>(null);
  const [unstakeTicker, setUnstakeTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { requirePin } = usePin();
  const { tgid } = useUser();
  const { webUserId } = useWebAuth();
  const pinUserId = String(tgid ?? webUserId ?? '');

  useEffect(() => {
    onUnstakeModalChange?.(!!unstakeTicker);
    return () => onUnstakeModalChange?.(false);
  }, [unstakeTicker, onUnstakeModalChange]);

  const liveMarket = useLiveAssets(MARKET_ASSETS);

  const getCategory = (asset: Asset): AssetCategory => asset.category ?? 'crypto';
  const rateByTicker = useMemo(() => {
    const m: Record<string, StakingRate> = {};
    stakingRates.forEach((r) => { m[r.ticker] = r; });
    return m;
  }, [stakingRates]);

  const spotByTicker = useMemo(() => {
    const m: Record<string, SpotHolding> = {};
    spotHoldings.forEach((h) => { m[h.ticker] = h; });
    return m;
  }, [spotHoldings]);

  const filters: { key: FilterType; labelKey: string }[] = [
    { key: 'Top', labelKey: 'filter_top' },
    { key: 'Gainers', labelKey: 'filter_gainers' },
    { key: 'Losers', labelKey: 'filter_losers' },
    { key: 'Vol', labelKey: 'filter_vol' },
    { key: 'New', labelKey: 'filter_new' },
  ];

  const filteredAssets = useMemo(() => {
    let base = liveMarket;

    if (assetTypeFilter !== 'all') {
      base = base.filter((asset) => getCategory(asset) === assetTypeFilter);
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      base = base.filter(
        (a) =>
          a.ticker.toLowerCase().includes(lowerQuery) ||
          a.name.toLowerCase().includes(lowerQuery)
      );
    }

    const sorted = [...base].sort((a, b) => {
      switch (activeFilter) {
        case 'Gainers': return b.change24h - a.change24h;
        case 'Losers': return a.change24h - b.change24h;
        case 'Vol': return b.volume24h - a.volume24h;
        case 'New': return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
        default: return 0;
      }
    });

    return sorted;
  }, [searchQuery, liveMarket, assetTypeFilter, activeFilter]);

  const handleOpenStake = (ticker: string) => {
    const holding = spotByTicker[ticker];
    const maxAmount = holding ? holding.amount : 0;
    if (maxAmount <= 0) {
      const asset = liveMarket.find((a) => a.ticker === ticker);
      if (asset) onNavigateToTrading(asset, { tradeType: 'spot', spotAction: 'buy' });
      return;
    }
    const rate = rateByTicker[ticker];
    Haptic.tap();
    setStakeScreen({ ticker, maxAmount, ratePerMonth: rate?.ratePerMonth ?? 0.13 });
  };

  const handleUnstake = async (ticker: string) => {
    if (userId <= 0) return;
    const asset = liveMarket.find((a) => a.ticker === ticker);
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
      toast.show(t('unstake_btn') + ' OK', 'success');
      Haptic.success();
    } else {
      toast.show(res.error || 'Error', 'error');
      Haptic.error();
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in relative">
      <div className="sticky top-0 z-50 bg-background pb-2">
        <div className="px-4 pt-4 pb-2">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-neutral-500 group-focus-within:text-neon transition-colors" />
            </div>
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder={t('search_pair')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => Haptic.tap()}
              className="block w-full pl-10 pr-3 py-2.5 bg-card border border-border/60 rounded-lg leading-5 text-white placeholder-neutral-600 focus:outline-none focus:border-neon/40 focus:ring-0 focus:bg-card transition-all font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar px-4 py-1.5 border-b border-border/60">
          {filters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => {
                Haptic.tap();
                setActiveFilter(filter.key);
              }}
              className={`
                whitespace-nowrap px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wide transition-all active:scale-95
                ${activeFilter === filter.key ? 'bg-card text-neon font-semibold border border-neon/50' : 'text-textSecondary hover:text-textPrimary hover:bg-card/60 border border-transparent'}
              `}
            >
              {t(filter.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-56 pt-2 min-h-screen">
        {/* Стейкинг убран: блок ниже больше не показывается */}
        {false && userId > 0 && (
          <section className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wide text-neutral-500 flex items-center gap-1.5">
                <TrendingUp size={12} className="text-neon" />
                {t('special_offer')} · {t('staking_title')}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface overflow-hidden">
              <div className="p-3 border-b border-white/5 flex items-start gap-2">
                <Info size={14} className="text-neon flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-neutral-400 leading-snug">
                  {t('staking_what_is')}
                </p>
              </div>
              <div className="px-3 pb-2">
                <p className="text-[10px] text-neutral-500 leading-snug">
                  {t('staking_rewards_to_balance')}
                </p>
              </div>
              <div className="p-2">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {STAKING_TICKERS.map((ticker) => {
                    const rate = rateByTicker[ticker];
                    const spot = spotByTicker[ticker];
                    const position = stakingPositions.find((p) => p.ticker === ticker);
                    const pct = rate ? Math.round(rate.ratePerMonth * 100) : 13;
                    const hasSpot = (spot?.amount ?? 0) > 0;
                    return (
                      <button
                        key={ticker}
                        onClick={() => handleOpenStake(ticker)}
                        className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-card hover:bg-surface border border-border hover:border-neon transition-all text-left min-w-0"
                      >
                        <span className="font-mono font-semibold text-white text-sm">{ticker}</span>
                        <span className="text-[10px] font-mono text-neon">~{pct}%</span>
                        {position && (
                          <span className="text-[10px] text-neutral-400 font-mono" title={`${position.amount.toFixed(4)}`}>
                            ✓
                          </span>
                        )}
                        {!hasSpot && !position && (
                          <span className="text-[9px] text-neutral-500">→</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {stakingPositions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                    {stakingPositions.map((pos) => {
                      const asset = liveMarket.find((a) => a.ticker === pos.ticker);
                      const price = asset?.price ?? 0;
                      const valueRub = price * pos.amount;
                      return (
                        <div key={pos.ticker} className="flex items-center justify-between gap-2 py-1">
                          <span className="text-xs font-mono text-white">{pos.ticker}</span>
                          <span className="text-[10px] text-neutral-400 font-mono truncate flex-1 text-right mx-1">
                            {pos.amount.toFixed(4)} {asset?.priceUnavailable ? '—' : price > 0 ? `≈ ${valueRub.toFixed(0)} ₽` : ''}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); Haptic.tap(); setUnstakeTicker(pos.ticker); }}
                            className="px-2 py-0.5 rounded text-[10px] font-mono border border-border text-textSecondary hover:bg-card"
                          >
                            {t('unstake_btn')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {filteredAssets.length > 0 ? (
          <>
            <AssetTable
              assets={filteredAssets}
              onAssetClick={onNavigateToTrading}
              externalFilter={activeFilter}
              hideFilterBar={true}
            />
            <div className="h-24" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-600 space-y-2">
            <Search size={32} className="opacity-20" />
            <span className="text-sm font-mono">{t('nothing_found')}</span>
          </div>
        )}
      </div>

      {/* Стейкинг временно отключён */}
      {false && stakeScreen && pinUserId && (
        <StakingCreateScreen
          ticker={stakeScreen.ticker}
          maxAmount={stakeScreen.maxAmount}
          ratePerMonth={stakeScreen.ratePerMonth}
          userId={userId}
          pinUserId={pinUserId}
          requirePin={requirePin}
          onClose={() => setStakeScreen(null)}
          onSuccess={(ticker, amount) => {
            refreshStaking();
            onReferralStake?.(ticker, amount);
          }}
          onError={(msg) => toast.show(msg, 'error')}
        />
      )}

      {/* Модалка вывода из стейкинга */}
      {unstakeTicker != null && (() => {
        const pos = stakingPositions.find((p) => p.ticker === unstakeTicker);
        const asset = liveMarket.find((a) => a.ticker === unstakeTicker);
        const price = asset?.price ?? 0;
        const amount = pos?.amount ?? 0;
        const amountRub = price * amount;
        return (
          <BottomSheet
            open
            onClose={() => setUnstakeTicker(null)}
            title={t('unstake_modal_title')}
            closeOnBackdrop
          >
            <p className="text-xs text-textMuted mb-3">
              {unstakeTicker} · {t('unstake_you_receive')}:
            </p>
            <div className="rounded-xl bg-surface border border-border p-3 mb-4">
              <p className="text-lg font-mono font-bold text-neon">
                {amount.toFixed(8)} {unstakeTicker}
              </p>
              <p className="text-[11px] text-textMuted mt-0.5">
                {asset?.priceUnavailable ? '—' : price > 0 ? `≈ ${amountRub.toFixed(0)} ${symbol}` : ''}
              </p>
            </div>
            <p className="text-[10px] text-textMuted mb-4">
              {t('unstake_principal_only')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { Haptic.tap(); setUnstakeTicker(null); }}
                className="flex-1 py-3 rounded-xl border border-border text-textSecondary font-medium text-sm hover:bg-card active:scale-[0.98]"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  if (pinUserId) {
                    requirePin(pinUserId, t('enter_pin_for_confirm'), () => handleUnstake(unstakeTicker));
                  } else {
                    handleUnstake(unstakeTicker);
                  }
                }}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-neon text-black font-bold text-sm disabled:opacity-50"
              >
                {loading ? '...' : t('confirm')}
              </button>
            </div>
          </BottomSheet>
        );
      })()}
    </div>
  );
};

export default CoinsPage;
