import React from 'react';
import { Home, Coins, BarChart2, Briefcase, ArrowLeftRight } from 'lucide-react';
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
    { id: 'EXCHANGE', label: t('nav_exchange'), icon: ArrowLeftRight },
    { id: 'DEALS', label: t('nav_deals'), icon: Briefcase },
  ];
  return (
    <aside className="hidden lg:flex flex-col w-56 min-w-[14rem] border-r border-border bg-card shrink-0">
      <nav className="sticky top-0 py-6 px-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => { Haptic.tap(); onNavigate(item.id); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                isActive ? 'bg-neon/20 text-neon border border-neon' : 'text-textMuted hover:text-white hover:bg-surface border border-transparent'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default SidebarNav;
