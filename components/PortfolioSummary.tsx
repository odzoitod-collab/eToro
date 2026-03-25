import React, { useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { MARKET_ASSETS } from '../constants';
import { useLiveAssets } from '../utils/useLiveAssets';
import type { SpotHolding } from '../types';

interface PortfolioSummaryProps {
  balanceRub: number;
  spotHoldings: SpotHolding[];
  onAssetClick?: (ticker: string) => void;
}

const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({
  balanceRub,
  spotHoldings,
  onAssetClick,
}) => {
  const { t } = useLanguage();
  const liveAssets = useLiveAssets(MARKET_ASSETS);

  const { currencyPct, cryptoPct, top3 } = useMemo(() => {
    const priceByTicker: Record<string, number> = {};
    liveAssets.forEach((a) => { priceByTicker[a.ticker] = a.price; });

    let totalCryptoRub = 0;
    const withValue: { ticker: string; valueRub: number }[] = [];
    spotHoldings.forEach((h) => {
      const price = priceByTicker[h.ticker] ?? 0;
      const valueRub = h.amount * price;
      if (valueRub > 0) {
        totalCryptoRub += valueRub;
        withValue.push({ ticker: h.ticker, valueRub });
      }
    });

    const totalRub = balanceRub + totalCryptoRub;
    const currencyPct = totalRub > 0 ? (balanceRub / totalRub) * 100 : 0;
    const cryptoPct = totalRub > 0 ? (totalCryptoRub / totalRub) * 100 : 0;
    const top3 = withValue
      .sort((a, b) => b.valueRub - a.valueRub)
      .slice(0, 3);

    return { currencyPct, cryptoPct, top3 };
  }, [balanceRub, spotHoldings, liveAssets]);

  const totalRub = useMemo(() => {
    const priceByTicker: Record<string, number> = {};
    liveAssets.forEach((a) => { priceByTicker[a.ticker] = a.price; });
    return balanceRub + spotHoldings.reduce((s, h) => s + h.amount * (priceByTicker[h.ticker] ?? 0), 0);
  }, [balanceRub, spotHoldings, liveAssets]);

  if (totalRub <= 0 && spotHoldings.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3 mb-3">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
        {t('portfolio_summary')}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex">
            <div
              className="h-full bg-neon/60 rounded-l-full transition-all"
              style={{ width: `${currencyPct}%` }}
            />
            <div
              className="h-full bg-white/30 rounded-r-full transition-all"
              style={{ width: `${cryptoPct}%` }}
            />
          </div>
          <p className="text-[10px] font-mono text-neutral-500 mt-1">
            {t('portfolio_currency')} {currencyPct.toFixed(0)}% · {t('portfolio_crypto')} {cryptoPct.toFixed(0)}%
          </p>
        </div>
        {top3.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            <span className="text-[10px] text-neutral-500">{t('portfolio_top')}:</span>
            {top3.map(({ ticker, valueRub }) => {
              const pct = totalRub > 0 ? (valueRub / totalRub) * 100 : 0;
              return (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => onAssetClick?.(ticker)}
                  className="font-mono text-xs font-medium text-neutral-400 hover:text-neon transition-colors"
                >
                  {ticker} {pct.toFixed(0)}%
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioSummary;
