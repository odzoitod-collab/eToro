import React from 'react';
import { Search, User } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { DbUser } from '../context/UserContext';
import { Haptic } from '../utils/haptics';
import { useCurrency } from '../context/CurrencyContext';

interface HomeHeaderProps {
  showBalanceTitle: boolean;
  balance: number;
  user: DbUser | null;
  onSearch?: () => void;
  onProfileClick?: () => void;
}

const HomeHeader: React.FC<HomeHeaderProps> = ({ showBalanceTitle, balance, user, onSearch, onProfileClick }) => {
  const { formatPrice, symbol } = useCurrency();
  const { t } = useLanguage();
  const formattedBalance = formatPrice(balance, { fractionDigits: 0 });

  return (
    <header
      className="sticky top-0 z-50 w-full bg-background border-b border-border"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="w-full px-4 lg:px-5 py-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { Haptic.tap(); onProfileClick?.(); }}
          className="touch-target flex items-center gap-2 min-w-0 px-2 py-1 rounded-full hover:bg-card active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30 min-h-[44px]"
        >
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt=""
              className="h-7 w-7 rounded-full border border-neutral-700 object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neon flex-shrink-0">
              <User size={14} />
            </div>
          )}
          <div className="hidden xs:flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              {t('sellbit')}
            </span>
            <span className="text-[11px] font-medium text-neutral-300 truncate max-w-[110px]">
              {user?.full_name || user?.username || t('profile')}
            </span>
          </div>
        </button>

        <div className="flex-1 flex items-center justify-center">
          <div className="inline-flex items-baseline gap-1 rounded-full bg-card px-2.5 py-0.5 border border-border/60">
            <span className="text-[13px] font-mono font-semibold text-textPrimary">
              {formattedBalance}
            </span>
            <span className="text-[10px] text-textSecondary uppercase tracking-[0.22em]">
              {symbol}
            </span>
          </div>
        </div>

        <button
          onClick={() => { Haptic.tap(); onSearch?.(); }}
          className="touch-target h-11 w-11 rounded-full flex items-center justify-center hover:bg-card active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30 flex-shrink-0"
        >
          <Search size={18} className="text-textSecondary" />
        </button>
      </div>
    </header>
  );
};

export default HomeHeader;