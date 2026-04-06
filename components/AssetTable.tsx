import React, { useState } from 'react';
import { Asset } from '../types';
import { Filter } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { formatFxRateQuote } from '../utils/chartSymbol';

export type FilterType = 'Top' | 'Gainers' | 'Losers' | 'Vol' | 'New';

interface AssetTableProps {
  assets: Asset[];
  onAssetClick?: (asset: Asset) => void;
  externalFilter?: FilterType; // Optional prop to control sort from outside
  hideFilterBar?: boolean;     // Optional prop to hide the internal filter UI
}

const AssetTable: React.FC<AssetTableProps> = ({ 
  assets, 
  onAssetClick, 
  externalFilter, 
  hideFilterBar = false 
}) => {
  const [internalFilter, setInternalFilter] = useState<FilterType>('Top');
  const { formatPrice, symbol, rates } = useCurrency();
  const rubPerUsd = rates?.usd?.rub;
  const { t } = useLanguage();

  const activeFilter = externalFilter || internalFilter;

  const filters: { key: FilterType; labelKey: string }[] = [
    { key: 'Top', labelKey: 'filter_top' },
    { key: 'Gainers', labelKey: 'filter_gainers' },
    { key: 'Losers', labelKey: 'filter_losers' },
    { key: 'Vol', labelKey: 'filter_vol' },
    { key: 'New', labelKey: 'filter_new' },
  ];

  const sortedAssets = [...assets].sort((a, b) => {
    switch (activeFilter) {
      case 'Gainers': return b.change24h - a.change24h;
      case 'Losers': return a.change24h - b.change24h;
      case 'Vol': return b.volume24h - a.volume24h;
      default: return 0; // Top
    }
  });


  const formatVol = (vol: number) => {
    if (vol >= 1000000000) return (vol / 1000000000).toFixed(1) + t('vol_b');
    if (vol >= 1000000) return (vol / 1000000).toFixed(1) + t('vol_m');
    return (vol / 1000).toFixed(0) + t('vol_k');
  };

  return (
    <div className="flex flex-col w-full relative">
      {!hideFilterBar && (
        <div className="py-2 mb-1 px-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Filter size={14} className="text-textMuted flex-shrink-0" />
          {filters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => { Haptic.tap(); setInternalFilter(filter.key); }}
              className={`text-xs font-mono uppercase tracking-cap px-3 py-2 rounded-lg whitespace-nowrap active:scale-[0.98] transition-etoro ${
                activeFilter === filter.key ? 'bg-card text-neon border border-neon' : 'text-textSecondary hover:text-textPrimary bg-transparent border border-transparent'
              }`}
            >
              {t(filter.labelKey)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-12 gap-1 text-cap font-mono text-textSecondary mb-1 px-1">
        <div className="col-span-5 text-left">{t('pair')}</div>
        <div className="col-span-3 text-right">{t('price')}</div>
        <div className="col-span-4 text-right">{t('change_24h')}</div>
      </div>

      <div className="flex flex-col gap-1 pb-6">
        {sortedAssets.map((asset) => (
          <div
            key={asset.id}
            onClick={() => { Haptic.tap(); onAssetClick?.(asset); }}
            className="grid grid-cols-12 gap-1 items-center min-h-[56px] py-2.5 px-2.5 rounded-lg bg-card cursor-pointer group transition-all duration-150 hover:bg-surface active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30"
          >
            <div className="col-span-5 flex flex-col min-w-0 gap-0.5">
              <span className="text-[15px] font-normal text-white group-hover:text-neon transition-etoro truncate">
                {asset.ticker}
              </span>
              <span className="text-[12px] text-textSecondary truncate">{asset.name}</span>
            </div>
            <div className="col-span-3 flex flex-col items-end justify-center gap-0.5">
              <span className="text-xs font-mono font-medium text-textPrimary tabular-nums">
                {asset.priceUnavailable
                  ? '—'
                  : asset.category === 'forex' && rubPerUsd != null && rubPerUsd > 0
                    ? formatFxRateQuote(asset.price / rubPerUsd)
                    : formatPrice(asset.price)}
              </span>
              <span className="text-[11px] text-textSecondary">
                {asset.category === 'forex' ? 'FX' : symbol}
              </span>
            </div>
            <div className="col-span-4 flex flex-col items-end justify-center gap-0.5">
              <span className={`text-xs font-mono font-medium tabular-nums ${(asset.change24h ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                {asset.change24h > 0 ? '+' : ''}{(asset.change24h ?? 0).toFixed(2)}%
              </span>
              <span className="text-[11px] text-textSecondary">{formatVol(asset.volume24h)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AssetTable;