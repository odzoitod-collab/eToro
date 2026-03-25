import React from 'react';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';

interface BalanceDisplayProps {
  balance: number;
  onCurrencyClick?: () => void;
}

const BalanceDisplay: React.FC<BalanceDisplayProps> = ({ balance, onCurrencyClick }) => {
  const { formatPrice, symbol } = useCurrency();
  const { t } = useLanguage();

  const formattedBalance = formatPrice(balance, { fractionDigits: 2 });

  return (
    <div className="flex flex-col items-center justify-center pt-8 pb-4 gap-4 relative">
      <span className="text-sm font-medium text-textSecondary tracking-tight">
        {t('total_balance')}
      </span>

      <div className="flex flex-nowrap items-baseline justify-center gap-1 min-w-0 max-w-[92vw]">
        <span className="text-[2rem] sm:text-[2.25rem] lg:text-[2.5rem] font-bold text-ink tabular-nums tracking-tight leading-none truncate">
          {symbol}
        </span>
        <span className="text-[2rem] sm:text-[2.25rem] lg:text-[2.5rem] font-bold text-ink tabular-nums tracking-tight leading-none truncate">
          {formattedBalance}
        </span>
      </div>

      <button
        type="button"
        onClick={onCurrencyClick}
        className="text-center text-xs sm:text-[13px] text-textMuted underline decoration-dotted underline-offset-4 decoration-white/15 max-w-sm px-2 transition-colors hover:text-textSecondary active:text-neon"
      >
        {t('balance_change_currency')}
      </button>
    </div>
  );
};

export default BalanceDisplay;
