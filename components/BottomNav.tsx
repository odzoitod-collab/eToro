import React from 'react';
import { Home, Coins, BarChart2, Briefcase, ArrowLeftRight } from 'lucide-react';
import { PageView, NavItem } from '../types';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';

interface BottomNavProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentPage, onNavigate }) => {
  const { t } = useLanguage();
  const navItems: NavItem[] = [
    { id: 'HOME', label: t('nav_home'), icon: Home },
    { id: 'COINS', label: t('nav_coins'), icon: Coins },
    { id: 'TRADING', label: t('nav_trading'), icon: BarChart2 },
    { id: 'EXCHANGE', label: t('nav_exchange'), icon: ArrowLeftRight },
    { id: 'DEALS', label: t('nav_deals'), icon: Briefcase },
  ];
  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl bg-card/95 backdrop-blur-md border-t border-x border-border pt-2 shadow-[0_-4px_24px_rgba(0,0,0,0.25)]"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex justify-around items-center min-h-[56px] px-2">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => { Haptic.tap(); onNavigate(item.id); }}
              className="touch-target flex flex-col items-center justify-center flex-1 min-w-0 py-2 active:scale-[0.96] transition-transform duration-150"
            >
              <div className={`transition-colors duration-200 ${isActive ? 'text-neon' : 'text-textMuted'}`}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-semibold tracking-wide mt-0.5 transition-colors duration-200 truncate w-full text-center leading-tight ${isActive ? 'text-neon' : 'text-textSubtle'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;