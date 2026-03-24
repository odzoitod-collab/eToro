import React from 'react';
import { Home, Coins, BarChart2, Briefcase, Percent } from 'lucide-react';
import { PageView, NavItem } from '../types';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';

interface SidebarNavProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({ currentPage, onNavigate }) => {
  const { t } = useLanguage();
  const navItems: NavItem[] = [
    { id: 'HOME', label: t('nav_home'), icon: Home },
    { id: 'COINS', label: t('nav_coins'), icon: Coins },
    { id: 'TRADING', label: t('nav_trading'), icon: BarChart2 },
    { id: 'STAKING', label: t('staking_title'), icon: Percent },
    { id: 'DEALS', label: t('nav_deals'), icon: Briefcase },
  ];
  return (
    <aside className="hidden lg:flex flex-col w-56 min-w-[14rem] shrink-0 bg-background">
      <nav className="sticky top-0 py-8 px-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          const stroke = 2;
          return (
            <button
              key={item.id}
              onClick={() => { Haptic.tap(); onNavigate(item.id); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors duration-200 ${
                isActive
                  ? 'bg-accentMuted text-neon'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={22} strokeWidth={stroke} />
              <span className="font-medium text-sm tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default SidebarNav;
