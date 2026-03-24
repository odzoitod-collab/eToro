import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { ETORO_LOGO_URL } from '../constants';
import { Haptic } from '../utils/haptics';

interface AuthFullScreenLayoutProps {
  children: React.ReactNode;
  onBack: () => void;
  /** Заголовок под шапкой (необязательно) */
  title?: string;
  subtitle?: string;
}

/**
 * Полноэкранный «лист» для входа/регистрации: как у бирж — без нижней навигации, с безопасными отступами.
 */
const AuthFullScreenLayout: React.FC<AuthFullScreenLayoutProps> = ({ children, onBack, title, subtitle }) => {
  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-background text-textPrimary overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117] via-background to-background pointer-events-none" />
      <div className="absolute top-0 right-0 w-[min(100%,420px)] h-64 bg-neon/[0.07] blur-[100px] rounded-full translate-x-1/3 -translate-y-1/2 pointer-events-none" />

      <header className="relative shrink-0 flex items-center gap-3 px-4 py-3 hairline-bottom bg-background/80 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            Haptic.light();
            onBack();
          }}
          className="touch-target flex items-center justify-center rounded-xl text-textMuted hover:text-textPrimary hover:bg-card min-h-[44px] min-w-[44px] -ml-1"
          aria-label="Назад"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-px rounded-2xl bg-gradient-to-br from-neon/70 via-white/25 to-neon/40 opacity-90"
              aria-hidden
            />
            <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-neon/40 via-card to-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_28px_-10px_rgba(0,255,136,0.3)]">
              <div className="rounded-[14px] bg-card/95 p-1 ring-1 ring-white/5">
                <img
                  src={ETORO_LOGO_URL}
                  alt=""
                  width={36}
                  height={36}
                  loading="eager"
                  decoding="async"
                  className="h-8 w-8 object-cover rounded-xl"
                />
              </div>
            </div>
          </div>
          <span className="text-sm font-semibold tracking-tight truncate">eToro</span>
        </div>
      </header>

      {(title || subtitle) && (
        <div className="relative shrink-0 px-5 pt-5 pb-2">
          {title ? <h1 className="text-xl font-bold text-ink tracking-tight">{title}</h1> : null}
          {subtitle ? <p className="text-sm text-textSecondary mt-1 leading-relaxed">{subtitle}</p> : null}
        </div>
      )}

      <div className="relative flex-1 min-h-0 overflow-y-auto no-scrollbar scroll-app px-5 pb-8 pt-2">
        <div className="max-w-md mx-auto w-full">{children}</div>
      </div>
    </div>
  );
};

export default AuthFullScreenLayout;
