import React, { useState, useMemo, useEffect } from 'react';
import AssetTable, { FilterType } from '../components/AssetTable';
import { MARKET_ASSETS, FOREX_MARKET_ASSETS } from '../constants';
import { Asset } from '../types';
import type { SpotHolding, StakingPosition, StakingRate } from '../types';
import { Search } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { usePin } from '../context/PinContext';
import { useUser } from '../context/UserContext';
import { useWebAuth } from '../context/WebAuthContext';
import { Haptic } from '../utils/haptics';
import { useLiveAssets } from '../utils/useLiveAssets';
import Skeleton from '../components/Skeleton';
import { stake, unstake } from '../lib/staking';
import { useToast } from '../context/ToastContext';
import BottomSheet from '../components/BottomSheet';
import BottomSheetFooter from '../components/BottomSheetFooter';
import { APP_TOP_BAR_CLASS, APP_TOP_BAR_STYLE } from '../components/appTopBar';

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
  const [marketMode, setMarketMode] = useState<'crypto' | 'forex'>('crypto');
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

  const liveCrypto = useLiveAssets(MARKET_ASSETS);
  const liveForex = useLiveAssets(FOREX_MARKET_ASSETS);
  const liveMarket = marketMode === 'forex' ? liveForex : liveCrypto;
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
  }, [searchQuery, liveMarket, activeFilter]);

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
      <header className={APP_TOP_BAR_CLASS} style={APP_TOP_BAR_STYLE}>
        <div className="px-4 lg:px-6 pb-2 max-w-2xl w-full mx-auto">
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

        <div className="flex items-center gap-2 px-4 lg:px-6 py-2 border-t border-white/[0.06] max-w-2xl w-full mx-auto">
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar flex-1 min-w-0">
            {filters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  Haptic.tap();
                  setActiveFilter(filter.key);
                }}
                className={`
                whitespace-nowrap px-3 py-2 min-h-[44px] rounded-lg text-xs font-mono uppercase tracking-wide transition-all active:scale-95
                ${activeFilter === filter.key ? 'bg-card text-neon font-semibold border border-neon/50' : 'text-textSecondary hover:text-textPrimary hover:bg-card/60 border border-transparent'}
              `}
              >
                {t(filter.labelKey)}
              </button>
            ))}
          </div>
          <div
            className="flex-shrink-0 flex rounded-lg border border-white/[0.08] bg-card/40 p-0.5 gap-0.5"
            role="group"
            aria-label={t('market_segment')}
          >
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                setMarketMode('crypto');
              }}
              className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-mono uppercase tracking-wide transition-all active:scale-95 ${
                marketMode === 'crypto'
                  ? 'bg-card text-neon font-semibold border border-neon/40'
                  : 'text-textSecondary hover:text-textPrimary border border-transparent'
              }`}
            >
              {t('market_crypto')}
            </button>
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                setMarketMode('forex');
              }}
              className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-mono uppercase tracking-wide transition-all active:scale-95 ${
                marketMode === 'forex'
                  ? 'bg-card text-neon font-semibold border border-neon/40'
                  : 'text-textSecondary hover:text-textPrimary border border-transparent'
              }`}
            >
              {t('market_forex')}
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pb-56 pt-2 min-h-screen">
        {liveMarket.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                className="w-full h-14 rounded-lg bg-card/60"
              />
            ))}
          </div>
        ) : filteredAssets.length > 0 ? (
          <>
            <AssetTable
              assets={filteredAssets}
              onAssetClick={(asset) =>
                onNavigateToTrading(asset, marketMode === 'forex' ? { tradeType: 'futures' } : undefined)
              }
              externalFilter={activeFilter}
              hideFilterBar={true}
            />
            <div className="h-24" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-600 space-y-2">
            <Search size={32} className="opacity-20" />
            <span className="text-sm font-mono">
              {t('nothing_found_for')} "{searchQuery}"
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs text-neutral-400 hover:text-neon underline underline-offset-2"
            >
              {t('clear_search')}
            </button>
          </div>
        )}
      </div>

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
              <p className="text-xs text-textMuted mt-0.5">
                {asset?.priceUnavailable ? '—' : price > 0 ? `≈ ${amountRub.toFixed(0)} ${symbol}` : ''}
              </p>
            </div>
            <p className="text-xs text-textMuted mb-4">
              {t('unstake_principal_only')}
            </p>
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

export default CoinsPage;
