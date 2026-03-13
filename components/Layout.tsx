import React from 'react';
import BottomNav from './BottomNav';
import SidebarNav from './SidebarNav';
import { PageView } from '../types';
import { useKeyboard } from '../context/KeyboardContext';
import { Haptic } from '../utils/haptics';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
  hideNavigation?: boolean;
}

const PAGES_WITHOUT_BOTTOM_NAV: PageView[] = ['KYC', 'CURRENCY', 'LANGUAGE'];

const isTelegramWebApp = () =>
  typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp;

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, hideNavigation = false }) => {
  const { keyboardOpen, keyboardOffset } = useKeyboard();
  const hideBottomNav = PAGES_WITHOUT_BOTTOM_NAV.includes(currentPage) || keyboardOpen || hideNavigation;
  const hasActiveP2P =
    typeof window !== 'undefined' &&
    !!window.localStorage.getItem('etoro_active_p2p_deal');
  const inMiniApp = isTelegramWebApp();
  const mainPaddingBottom = keyboardOffset > 0 && !inMiniApp ? keyboardOffset + 16 : undefined;

  return (
    <div
      className="h-screen min-h-[100dvh] bg-background text-white flex flex-col lg:flex-row relative overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {!hideBottomNav && <SidebarNav currentPage={currentPage} onNavigate={onNavigate} />}

      <main
        className={`flex-1 overflow-y-auto w-full relative z-10 no-scrollbar scroll-smooth overscroll-contain scroll-app transition-[padding] duration-150
          max-w-md lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto
          ${hideBottomNav ? 'pb-2' : 'pb-20 lg:pb-8'}
        `}
        style={mainPaddingBottom != null ? { paddingBottom: mainPaddingBottom } : undefined}
      >
        {children}
      </main>

      {!hideBottomNav && (
        <div
          className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 transition-transform duration-200 ease-out ${
            keyboardOpen ? 'translate-y-full pointer-events-none' : 'translate-y-0'
          }`}
        >
          {hasActiveP2P && currentPage !== 'DEPOSIT' && (
            <button
              onClick={() => {
                Haptic.tap();
                onNavigate('DEPOSIT');
              }}
              className="mx-3 mb-2 mt-1 w-auto rounded-2xl bg-neon/10 border border-neon/40 text-neon text-xs font-semibold px-3 py-1.5 flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(0,255,170,0.2)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" />
              Открытая П2П-сделка
            </button>
          )}
          <BottomNav currentPage={currentPage} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
};

export default Layout;