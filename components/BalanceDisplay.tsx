import React from 'react';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';

interface BalanceDisplayProps {
  balance: number;
  onCurrencyClick?: () => void;
}

const BalanceDisplay: React.FC<BalanceDisplayProps> = ({ balance, onCurrencyClick }) => {
  const { formatPrice, symbol, baseCurrency } = useCurrency();
  const { t } = useLanguage();

  const formattedBalance = formatPrice(balance, { fractionDigits: 0 });
  const currencyKey = baseCurrency === 'usd' ? 'currency_dollars' : baseCurrency === 'rub' ? 'currency_rubles' : baseCurrency === 'eur' ? 'currency_euros' : 'currency_default';
  const currencyName = t(currencyKey);

  return (
    <div className="flex flex-col items-center justify-center pt-8 pb-3 space-y-3 relative">
      <span className="text-sm font-medium text-neutral-500 uppercase tracking-widest">
        {t('total_balance')}
      </span>
      
      <div className="flex items-baseline justify-center space-x-2 w-full max-w-[90vw] min-w-0">
        <span className="text-4xl sm:text-5xl lg:text-6xl font-mono font-bold text-white tracking-tighter tabular-nums truncate min-w-0">
          {formattedBalance}
        </span>
        <span className="text-2xl sm:text-3xl font-mono text-neon font-medium flex-shrink-0 tabular-nums">{symbol}</span>
      </div>
      <button
        type="button"
        onClick={onCurrencyClick}
        className="text-xs text-neutral-500 hover:text-neon active:text-neon underline decoration-dotted decoration-neutral-600 hover:decoration-neon underline-offset-2 transition-colors cursor-pointer"
      >
        {t('rates_realtime')} · {t('in_currency', { currency: currencyName })}
      </button>
    </div>
  );
};

export default BalanceDisplay;