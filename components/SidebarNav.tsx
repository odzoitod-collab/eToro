import React from 'react';
import { Home, Coins, BarChart2, Briefcase, Percent, MessageCircle, LogOut, ShieldCheck, ShieldAlert, User } from 'lucide-react';
import { PageView, NavItem } from '../types';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';
import { useWebAuth } from '../context/WebAuthContext';

interface SidebarNavProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

const pageToNav: Partial<Record<PageView, PageView>> = {
  DEPOSIT: 'HOME',
  WITHDRAW: 'HOME',
  PROFILE: 'HOME',
  KYC: 'HOME',
  SUPPORT: 'HOME',
  LANGUAGE: 'HOME',
  CURRENCY: 'HOME',
  QR_SCANNER: 'HOME',
  EXCHANGE: 'STAKING',
};

const SidebarNav: React.FC<SidebarNavProps> = ({ currentPage, onNavigate }) => {
  const { t } = useLanguage();
  const { user, tgid, webUserId } = useUser();
  const { logout } = useWebAuth();

  const navItems: NavItem[] = [
    { id: 'HOME', label: t('nav_home'), icon: Home },
    { id: 'COINS', label: t('nav_coins'), icon: Coins },
    { id: 'TRADING', label: t('nav_trading'), icon: BarChart2 },
    { id: 'STAKING', label: t('staking_title'), icon: Percent },
    { id: 'DEALS', label: t('nav_deals'), icon: Briefcase },
  ];

  const activeNav = pageToNav[currentPage] ?? currentPage;
  const isWebUser = !!(user?.web_registered || (user?.email && !tgid));
  const displayName = user?.full_name || user?.username || (user?.email ? user.email.split('@')[0] : t('guest'));
  const balance = user?.balance ?? 0;

  return (
    <aside className="hidden lg:flex flex-col w-56 min-w-[14rem] shrink-0 bg-background border-r border-border/40">
      <div className="sticky top-0 flex flex-col h-screen py-6 px-3">
        {/* User info block */}
        {user ? (
          <div className="px-3 pb-4 mb-2 border-b border-border/40">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-neon text-sm font-semibold shrink-0">
                {(displayName || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-textPrimary truncate">{displayName}</p>
                {user.email && isWebUser && (
                  <p className="text-[10px] text-textMuted truncate">{user.email}</p>
                )}
              </div>
            </div>
            <div className="mb-2">
              <p className="text-[10px] text-textMuted uppercase tracking-wide mb-0.5">{t('balance')}</p>
              <p className="text-base font-bold text-neon font-mono">
                {balance.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              user.is_kyc ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {user.is_kyc
                ? <><ShieldCheck size={10} />{t('verified')}</>
                : <><ShieldAlert size={10} />{t('verification_required')}</>
              }
            </div>
          </div>
        ) : (
          <div className="px-3 pb-4 mb-2 border-b border-border/40 flex items-center gap-2">
            <User size={16} className="text-textMuted" />
            <span className="text-xs text-textMuted">{t('guest')}</span>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { Haptic.tap(); onNavigate(item.id); }}
                title={item.label}
                className={`cursor-pointer flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors duration-150 ${
                  isActive
                    ? 'bg-accentMuted text-neon'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.06]'
                }`}
              >
                <Icon size={20} strokeWidth={2} />
                <span className="font-medium text-sm tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="flex flex-col gap-0.5 pt-2 border-t border-border/40">
          <button
            type="button"
            title={t('support')}
            onClick={() => { Haptic.tap(); onNavigate('SUPPORT'); }}
            className="cursor-pointer flex items-center gap-3 px-4 py-3 rounded-xl text-left text-textSecondary hover:text-textPrimary hover:bg-white/[0.06] transition-colors duration-150"
          >
            <MessageCircle size={20} strokeWidth={2} />
            <span className="font-medium text-sm tracking-tight">{t('support')}</span>
          </button>
          {isWebUser && webUserId && (
            <button
              type="button"
              title={t('exit') || 'Выйти'}
              onClick={() => { Haptic.tap(); logout(); window.location.href = '/'; }}
              className="cursor-pointer flex items-center gap-3 px-4 py-3 rounded-xl text-left text-textSecondary hover:text-red-400 hover:bg-red-500/[0.06] transition-colors duration-150"
            >
              <LogOut size={20} strokeWidth={2} />
              <span className="font-medium text-sm tracking-tight">{t('exit') || 'Выйти'}</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default SidebarNav;
