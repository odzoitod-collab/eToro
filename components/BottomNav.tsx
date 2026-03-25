import React from 'react';
import { Home, Coins, BarChart2, Briefcase, Percent } from 'lucide-react';
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
    { id: 'STAKING', label: t('staking_title'), icon: Percent },
    { id: 'DEALS', label: t('nav_deals'), icon: Briefcase },
  ];
  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl bg-card shadow-[0_-10px_36px_rgba(0,0,0,0.4)]"
      style={{
        paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex justify-around items-stretch min-h-[56px] px-1 pt-2 pb-0">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          const stroke = 2;

          return (
            <button
              key={item.id}
              onClick={() => { Haptic.tap(); onNavigate(item.id); }}
              className="touch-target flex flex-col items-center justify-center flex-1 min-w-0 gap-1 py-2 active:scale-[0.97] transition-transform duration-150"
            >
              <div
                className={`flex items-center justify-center rounded-xl transition-colors duration-200 ${
                  isActive ? 'text-neon bg-accentMuted' : 'text-textMuted'
                }`}
                style={{ width: 40, height: 32 }}
              >
                <Icon size={22} strokeWidth={stroke} />
              </div>
              <span
                className={`text-[11px] font-medium tracking-tight transition-colors duration-200 truncate w-full text-center leading-none ${
                  isActive ? 'text-neon' : 'text-textSecondary'
                }`}
              >
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