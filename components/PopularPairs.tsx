import React from 'react';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { Haptic } from '../utils/haptics';
import type { Asset } from '../types';

const POPULAR_TICKERS = [
  'BTC', 'ETH', 'SOL', 'TON', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC',
  'LINK', 'UNI', 'LTC', 'BCH', 'ATOM', 'ETC', 'XLM', 'NEAR', 'APT', 'ARB',
];

function CoinChip({
  asset,
  formatPrice,
  symbol,
  onAssetClick,
}: {
  asset: Asset;
  formatPrice: (n: number) => string;
  symbol: string;
  onAssetClick: (a: Asset) => void;
}) {
  const isUp = (asset.change24h ?? 0) >= 0;
  return (
    <button
      type="button"
      onClick={() => {
        Haptic.tap();
        onAssetClick(asset);
      }}
      className="flex-shrink-0 flex items-center gap-2 rounded-md border border-border/60 bg-card/80 px-2.5 py-1.5 text-left hover:border-neon/50 hover:bg-card transition-all active:scale-[0.98]"
    >
      <span className="font-mono font-semibold text-white text-xs">
        {asset.ticker}
      </span>
      <span className="text-[10px] font-mono text-neutral-500 whitespace-nowrap">
        {asset.priceUnavailable ? '—' : formatPrice(asset.price)} {symbol}
      </span>
      <span
        className={`text-[9px] font-mono flex-shrink-0 ${
          (asset.change24h ?? 0) >= 0 ? 'text-up' : 'text-down'
        }`}
      >
        {(asset.change24h ?? 0) >= 0 ? '+' : ''}{(asset.change24h ?? 0).toFixed(2)}%
      </span>
    </button>
  );
}

interface PopularPairsProps {
  assets: Asset[];
  onAssetClick: (asset: Asset) => void;
}

const PopularPairs: React.FC<PopularPairsProps> = ({ assets, onAssetClick }) => {
  const { formatPrice, symbol } = useCurrency();
  const { t } = useLanguage();

  const popular = POPULAR_TICKERS
    .map((ticker) => assets.find((a) => a.ticker === ticker))
    .filter((a): a is Asset => a != null);

  if (popular.length === 0) return null;

  return (
    <div className="mt-3 mb-1">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5 px-0.5">
        {t('popular_pairs')}
      </p>
      <div className="overflow-hidden w-full">
        <div className="flex gap-1.5 w-max animate-marquee">
          {[1, 2].map((copy) => (
            <div key={copy} className="flex gap-1.5 flex-shrink-0">
              {popular.map((asset) => (
                <CoinChip
                  key={`${asset.ticker}-${copy}`}
                  asset={asset}
                  formatPrice={formatPrice}
                  symbol={symbol}
                  onAssetClick={onAssetClick}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PopularPairs;
