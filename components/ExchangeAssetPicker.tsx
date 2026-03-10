import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { Haptic } from '../utils/haptics';
import { Z_INDEX } from '../constants/zIndex';
import { MARKET_ASSETS } from '../constants';
import { useLiveAssets } from '../utils/useLiveAssets';
import type { SpotHolding } from '../types';

export type ExchangeSide = 'currency' | string;

function isExcluded(side: ExchangeSide, exclude: ExchangeSide | null): boolean {
  if (!exclude) return false;
  if (side === 'currency' && exclude === 'currency') return true;
  if (typeof side === 'string' && side === exclude) return true;
  return false;
}

interface ExchangeAssetPickerProps {
  open: boolean;
  title: string;
  mode: 'from' | 'to';
  selected: ExchangeSide;
  exclude: ExchangeSide | null;
  spotHoldings: SpotHolding[];
  balanceRub: number;
  onSelect: (side: ExchangeSide) => void;
  onClose: () => void;
}

const ExchangeAssetPicker: React.FC<ExchangeAssetPickerProps> = ({
  open,
  title,
  mode,
  selected,
  exclude,
  spotHoldings,
  balanceRub,
  onSelect,
  onClose,
}) => {
  const { t } = useLanguage();
  const { formatPrice, symbol } = useCurrency();
  const liveAssets = useLiveAssets(MARKET_ASSETS);
  const [searchQuery, setSearchQuery] = useState('');

  const holdingsByTicker = useMemo(() => {
    const m: Record<string, SpotHolding> = {};
    spotHoldings.forEach((h) => {
      m[h.ticker] = h;
    });
    return m;
  }, [spotHoldings]);

  const myHoldings = useMemo(() => spotHoldings.filter((h) => h.amount > 0), [spotHoldings]);

  const assetsForFrom = useMemo(() => {
    return myHoldings
      .map((h) => liveAssets.find((a) => a.ticker === h.ticker))
      .filter(Boolean) as typeof liveAssets;
  }, [myHoldings, liveAssets]);

  const filteredAssetsForFrom = useMemo(() => {
    if (!searchQuery.trim()) return assetsForFrom;
    const q = searchQuery.trim().toLowerCase();
    return assetsForFrom.filter((a) => a.ticker.toLowerCase().includes(q));
  }, [assetsForFrom, searchQuery]);

  const filteredAssetsForTo = useMemo(() => {
    if (!searchQuery.trim()) return liveAssets;
    const q = searchQuery.trim().toLowerCase();
    return liveAssets.filter((a) => a.ticker.toLowerCase().includes(q));
  }, [liveAssets, searchQuery]);

  const filteredAssets = mode === 'from' ? filteredAssetsForFrom : filteredAssetsForTo;

  const handleSelect = (side: ExchangeSide) => {
    if (isExcluded(side, exclude)) return;
    Haptic.tap();
    onSelect(side);
    onClose();
  };

  const handleClose = () => {
    Haptic.tap();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col animate-fade-in"
      style={{ zIndex: Z_INDEX.picker }}
    >
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <h2 className="text-base font-semibold text-textPrimary">{title}</h2>
        <button
          type="button"
          onClick={handleClose}
          className="touch-target p-2 -mr-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-surface active:scale-95 transition-all flex items-center justify-center"
          aria-label={t('close')}
        >
          <X size={20} strokeWidth={2} />
        </button>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="px-4 pt-3 pb-2 shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-textPrimary placeholder:text-textMuted text-sm font-mono focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/20 transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 scroll-app">
          <button
            type="button"
            onClick={() => handleSelect('currency')}
            disabled={isExcluded('currency', exclude)}
            className={`w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl border text-left transition-all mb-1.5 touch-target min-h-[48px] ${
              isExcluded('currency', exclude)
                ? 'opacity-50 cursor-not-allowed border-border bg-surface/50'
                : selected === 'currency'
                  ? 'bg-neon/15 border-neon/40 text-neon'
                  : 'bg-surface border-border text-textPrimary hover-row hover:border-neon/30 active:scale-[0.99]'
            }`}
          >
            <span className="font-mono font-semibold text-sm">{symbol}</span>
            <span className="text-[11px] font-mono text-textMuted truncate">
              {t('exchange_balance')}: {formatPrice(balanceRub)}
            </span>
          </button>

          <div className="flex flex-col gap-1 mt-2">
            {filteredAssets.map((asset) => {
              const holding = holdingsByTicker[asset.ticker];
              const amount = holding?.amount ?? 0;
              const disabled = isExcluded(asset.ticker, exclude);
              const isSelected = selected === asset.ticker;
              const showBalance = mode === 'from' ? true : amount > 0;

              return (
                <button
                  key={asset.ticker}
                  type="button"
                  onClick={() => handleSelect(asset.ticker)}
                  disabled={disabled}
                  className={`w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl border text-left transition-all touch-target min-h-[48px] ${
                    disabled
                      ? 'opacity-50 cursor-not-allowed border-border bg-surface/50'
                      : isSelected
                        ? 'bg-neon/15 border-neon/40 text-neon'
                        : 'bg-surface border-border text-textPrimary hover-row hover:border-neon/30 active:scale-[0.99]'
                  }`}
                >
                  <span className="font-mono font-semibold text-sm">{asset.ticker}</span>
                  {showBalance && (
                    <span className="text-[11px] font-mono text-textMuted truncate">
                      {mode === 'from' ? `${t('exchange_balance')}: ${amount.toFixed(6)}` : amount.toFixed(6)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {filteredAssets.length === 0 && (
            <p className="text-sm text-textMuted py-8 text-center font-mono">{t('nothing_found')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExchangeAssetPicker;
