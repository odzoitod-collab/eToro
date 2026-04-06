import React from 'react';
import { ArrowLeft, TrendingUp, BarChart2, Shield } from 'lucide-react';
import { ETORO_LOGO_URL } from '../constants';
import { Haptic } from '../utils/haptics';

interface AuthFullScreenLayoutProps {
  children: React.ReactNode;
  onBack: () => void;
  /** Заголовок под шапкой (необязательно) */
  title?: string;
  subtitle?: string;
  /** Если true — включить сплит-экран на desktop */
  split?: boolean;
}

/**
 * Полноэкранный «лист» для входа/регистрации: как у бирж — без нижней навигации, с безопасными отступами.
 */
const AuthFullScreenLayout: React.FC<AuthFullScreenLayoutProps> = ({
  children,
  onBack,
  title,
  subtitle,
  split = true,
}) => {
  return (
    <div
      className="fixed inset-0 z-[300] bg-background text-textPrimary overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117] via-background to-background pointer-events-none" />
      <div className="absolute top-0 right-0 w-[min(100%,520px)] h-72 bg-neon/[0.07] blur-[120px] rounded-full translate-x-1/3 -translate-y-1/2 pointer-events-none" />

      <div className={`h-full w-full ${split ? 'lg:grid lg:grid-cols-2' : 'flex flex-col'}`}>
        {/* LEFT: Hero (desktop only) */}
        {split && (
          <aside className="hidden lg:flex relative overflow-hidden border-r border-border/60 bg-surface">
            {/* геометрический паттерн (очень низкая прозрачность) */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <div className="absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-white/[0.03]" />
              <div className="absolute top-[18%] right-[-120px] h-[340px] w-[340px] rotate-12 bg-white/[0.02] rounded-[48px]" />
              <div className="absolute bottom-[-120px] left-[20%] h-[380px] w-[380px] rotate-[-8deg] bg-neon/[0.04] rounded-full blur-[2px]" />
            </div>

            <div className="relative flex-1 flex flex-col p-10">
              <div className="flex items-center gap-3">
                <img
                  src={ETORO_LOGO_URL}
                  alt=""
                  width={40}
                  height={40}
                  decoding="async"
                  className="h-10 w-10 rounded-2xl object-cover ring-1 ring-white/10"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight text-textPrimary truncate">eToro</div>
                  <div className="text-[11px] text-textMuted truncate">Торговля и инвестиции</div>
                </div>
              </div>

              <div className="mt-12">
                <h1 className="text-4xl font-bold tracking-tight text-ink leading-[1.05]">
                  Премиальный{' '}
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-neon via-neon/80 to-up">
                    инструмент для трейдинга
                  </span>
                </h1>
                <p className="mt-4 text-sm text-textSecondary leading-relaxed max-w-md">
                  Терминальный интерфейс в стиле финтех‑платформ: быстро, строго, без визуального шума.
                </p>
              </div>

              <div className="mt-10 grid gap-4 max-w-md">
                <div className="flex items-start gap-3 rounded-2xl bg-background/35 border border-white/[0.06] px-4 py-3">
                  <TrendingUp size={18} className="text-neon shrink-0 mt-0.5" strokeWidth={2} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-textPrimary">Рыночные данные</div>
                    <div className="text-[12px] text-textSecondary leading-snug">
                      Котировки и динамика без лишних экранов.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-background/35 border border-white/[0.06] px-4 py-3">
                  <BarChart2 size={18} className="text-neon shrink-0 mt-0.5" strokeWidth={2} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-textPrimary">Аналитика</div>
                    <div className="text-[12px] text-textSecondary leading-snug">
                      Графики TradingView и терминальный UX.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-background/35 border border-white/[0.06] px-4 py-3">
                  <Shield size={18} className="text-neon shrink-0 mt-0.5" strokeWidth={2} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-textPrimary">Надёжность</div>
                    <div className="text-[12px] text-textSecondary leading-snug">
                      Защита данных и подтверждения действий.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-10 text-[11px] text-textMuted">
                © eToro
              </div>
            </div>
          </aside>
        )}

        {/* RIGHT: Form */}
        <section className="relative flex flex-col h-full overflow-hidden">
          {/* декоративные “треугольники” в углах */}
          <div className="absolute -top-10 -right-10 h-40 w-40 rotate-12 bg-neon/[0.08] blur-[1px] clip-triangle pointer-events-none" />
          <div className="absolute bottom-[-60px] left-[-60px] h-52 w-52 -rotate-6 bg-white/[0.03] blur-[1px] clip-triangle pointer-events-none" />

          {/* Header (mobile + desktop) */}
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

            {/* компактный логотип (особенно для mobile) */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <img
                src={ETORO_LOGO_URL}
                alt=""
                width={32}
                height={32}
                decoding="async"
                className="h-8 w-8 rounded-2xl object-cover ring-1 ring-white/10"
              />
              <span className="text-sm font-semibold tracking-tight truncate text-textPrimary">eToro</span>
            </div>
          </header>

          {(title || subtitle) && (
            <div className="relative shrink-0 px-5 pt-6 pb-2">
              {title ? <h1 className="text-2xl font-bold text-ink tracking-tight">{title}</h1> : null}
              {subtitle ? <p className="text-sm text-textSecondary mt-1 leading-relaxed">{subtitle}</p> : null}
            </div>
          )}

          <div className="relative flex-1 min-h-0 overflow-y-auto no-scrollbar scroll-app px-5 pb-10 pt-2">
            <div className="max-w-md mx-auto w-full">
              {children}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AuthFullScreenLayout;
