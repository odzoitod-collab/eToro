import React, { useState, useEffect } from 'react';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';

/** Референсные цены в RUB (база для тикера) */
const TICKER_ITEMS = [
  { pair: 'BTC', priceRub: 6_250_000, change: '+0.12%', side: 'up' as const },
  { pair: 'ETH', priceRub: 320_000, change: '-0.05%', side: 'down' as const },
  { pair: 'SOL', priceRub: 12_500, change: '+1.2%', side: 'up' as const },
  { pair: 'TON', priceRub: 650, change: '+0.3%', side: 'up' as const },
  { pair: 'BTC', priceRub: 6_248_000, change: '-0.02%', side: 'down' as const },
  { pair: 'DOGE', priceRub: 12.8, change: '+5.1%', side: 'up' as const },
  { pair: 'XRP', priceRub: 55.2, change: '-0.1%', side: 'down' as const },
  { pair: 'ETH', priceRub: 319_500, change: '+0.8%', side: 'up' as const },
];

const MarketTicker: React.FC = () => {
  const [start, setStart] = useState(0);
  const visible = 4;
  const { formatPrice, symbol, currencyCode } = useCurrency();
  const { t } = useLanguage();
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS].slice(start, start + visible);

  useEffect(() => {
    const t = setInterval(() => {
      setStart((s) => (s + 1) % TICKER_ITEMS.length);
    }, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full overflow-hidden rounded-lg bg-black/30 border border-white/5 px-3 py-1">
      <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-0.5">{t('last_trades')}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {items.map((item, i) => (
          <span key={`${item.pair}-${start}-${i}`} className="text-[11px] font-mono flex items-center gap-1 leading-tight">
            <span className="text-white">{item.pair}/{currencyCode}</span>
            <span className="text-neutral-500">{formatPrice(item.priceRub)} {symbol}</span>
            <span className={item.side === 'up' ? 'text-up' : 'text-down'}>{item.change}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default MarketTicker;
