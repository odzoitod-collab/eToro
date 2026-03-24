import React, { useState } from 'react';
import { LogIn, UserPlus, Shield, Lock, Snowflake, Star, Smartphone, LayoutDashboard, LineChart } from 'lucide-react';
import LegalDocModal, { LegalDocId } from '../components/LegalDocModal';
import { ETORO_LOGO_URL } from '../constants';

interface LandingPageProps {
  refId: string;
  onLogin: () => void;
  onRegister: () => void;
}

const COINS = ['BTC', 'ETH', 'SOL', 'TON'];

const LandingPage: React.FC<LandingPageProps> = ({ refId, onLogin, onRegister }) => {
  const [legal, setLegal] = useState<LegalDocId | null>(null);

  return (
    <div className="min-h-[100dvh] bg-background text-white flex flex-col relative overflow-x-hidden">
      {/* Фон без внешних URL — лёгкое «дыхание» бликов (landing-float в index.html) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="landing-float absolute -top-[40%] left-1/2 -translate-x-1/2 w-[min(120%,720px)] aspect-square rounded-full bg-neon/[0.09] blur-[90px]" />
        <div className="absolute bottom-0 right-[-20%] w-[min(70%,480px)] aspect-square rounded-full bg-neon/[0.05] blur-[70px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_0%,rgba(0,255,136,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/92 to-background" />
      </div>

      {/* Top bar */}
      <header className="landing-animate landing-d1 relative z-20 flex items-center justify-between px-4 sm:px-6 py-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-px rounded-2xl bg-gradient-to-br from-neon/70 via-white/25 to-neon/40 opacity-90"
              aria-hidden
            />
            <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-neon/40 via-card to-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_40px_-12px_rgba(0,255,136,0.35)]">
              <div className="rounded-[14px] bg-card/95 p-1 ring-1 ring-white/5">
                <img
                  src={ETORO_LOGO_URL}
                  alt="eToro"
                  width={40}
                  height={40}
                  loading="eager"
                  decoding="async"
                  className="h-9 w-9 sm:h-10 sm:w-10 object-cover rounded-xl"
                />
              </div>
            </div>
          </div>
          <span className="text-base font-bold text-ink tracking-tight">eToro</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onLogin}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-textPrimary hover:bg-card/80 border border-transparent hover:border-border transition-all"
          >
            Войти
          </button>
          <button
            type="button"
            onClick={onRegister}
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-neon text-black shadow-md shadow-neon/20 hover:bg-neon/90 active:scale-[0.98] transition-all"
          >
            Регистрация
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16 scroll-smooth">
        {/* 1. Hero */}
        <section className="landing-animate landing-d2 pt-6 sm:pt-12 pb-14 text-center max-w-2xl mx-auto">
          <h1 className="text-[1.65rem] sm:text-4xl font-bold text-ink tracking-tight leading-tight mb-3">
            Торгуйте криптовалютой безопасно и просто
          </h1>
          <p className="text-sm sm:text-base text-textSecondary mb-8">
            0% комиссии · Лицензия · 1M+ пользователей
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center max-w-md mx-auto">
            <button
              type="button"
              onClick={onRegister}
              className="w-full sm:flex-1 py-4 px-6 rounded-2xl bg-neon text-black font-bold text-base shadow-lg shadow-neon/25 hover:bg-neon/90 active:scale-[0.99] transition-all"
            >
              Создать аккаунт
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="w-full sm:flex-1 py-4 px-6 rounded-2xl bg-card border border-border text-textPrimary font-semibold hover:border-neon/35 hover:bg-surface transition-all"
            >
              Войти
            </button>
          </div>
          {refId ? (
            <p className="mt-4 text-xs text-neon/90">Вы перешли по реферальной ссылке партнёра.</p>
          ) : null}
        </section>

        {/* 2. Платформа / интерфейс */}
        <section className="landing-animate landing-d3 mb-16">
          <h2 className="text-lg font-semibold text-textPrimary text-center mb-6 tracking-tight">
            Платформа, которой доверяют
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { Icon: LineChart, title: 'Терминал', desc: 'Графики, ордера, рыночные данные в одном окне.' },
              { Icon: LayoutDashboard, title: 'Портфель', desc: 'Баланс, активы и история операций.' },
              { Icon: Smartphone, title: 'Мобильное приложение', desc: 'Торгуйте с телефона в любом месте.' },
            ].map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl bg-card/80 border border-white/[0.06] p-5 text-left hover:border-neon/25 hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-neon/15 flex items-center justify-center text-neon mb-3">
                  <Icon size={22} strokeWidth={2} />
                </div>
                <h3 className="font-semibold text-textPrimary mb-1">{title}</h3>
                <p className="text-sm text-textMuted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Социальное доказательство */}
        <section className="landing-animate landing-d4 mb-16 text-center">
          <div className="inline-flex items-center gap-1 text-amber-400 mb-2 justify-center">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={18} className="fill-amber-400 text-amber-400" />
            ))}
            <span className="ml-2 text-sm font-semibold text-textPrimary">4.8</span>
          </div>
          <p className="text-2xl font-bold text-ink">1&nbsp;200&nbsp;000+</p>
          <p className="text-sm text-textMuted">пользователей по всему миру</p>
        </section>

        {/* 4. Безопасность */}
        <section className="landing-animate landing-d5 mb-16">
          <h2 className="text-lg font-semibold text-textPrimary text-center mb-6 tracking-tight">Безопасность</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="flex gap-3 rounded-2xl bg-surface/60 border border-border/80 p-4">
              <Snowflake className="text-neon shrink-0 mt-0.5" size={22} />
              <div>
                <p className="font-semibold text-textPrimary text-sm">Cold wallets</p>
                <p className="text-xs text-textMuted mt-1 leading-relaxed">Основная часть средств хранится офлайн.</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl bg-surface/60 border border-border/80 p-4">
              <Lock className="text-neon shrink-0 mt-0.5" size={22} />
              <div>
                <p className="font-semibold text-textPrimary text-sm">2FA</p>
                <p className="text-xs text-textMuted mt-1 leading-relaxed">Дополнительная защита входа в аккаунт.</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl bg-surface/60 border border-border/80 p-4">
              <Shield className="text-neon shrink-0 mt-0.5" size={22} />
              <div>
                <p className="font-semibold text-textPrimary text-sm">Регуляция</p>
                <p className="text-xs text-textMuted mt-1 leading-relaxed">Соблюдение требований AML/KYC.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Монеты */}
        <section className="landing-animate landing-d5 mb-16">
          <h2 className="text-lg font-semibold text-textPrimary text-center mb-4 tracking-tight">Популярные активы</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {COINS.map((c) => (
              <span
                key={c}
                className="px-5 py-2.5 rounded-xl bg-card border border-border font-mono text-sm font-semibold text-textPrimary"
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* CTA повтор */}
        <section className="landing-animate landing-d6 rounded-2xl bg-gradient-to-br from-neon/20 via-card to-card border border-neon/25 p-8 text-center mb-8">
          <p className="text-textPrimary font-semibold mb-4">Готовы начать?</p>
          <button
            type="button"
            onClick={onRegister}
            className="w-full max-w-sm mx-auto py-4 rounded-2xl bg-neon text-black font-bold shadow-lg shadow-neon/20 hover:bg-neon/90 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2"
          >
            <UserPlus size={22} />
            Создать аккаунт
          </button>
        </section>
      </main>

      {/* 6. Footer */}
      <footer className="landing-animate landing-d6 relative z-20 border-t border-white/[0.06] bg-background/90 backdrop-blur-md py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-textMuted">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <button type="button" className="hover:text-textSecondary underline-offset-2 hover:underline" onClick={() => setLegal('tos')}>
              Terms of Service
            </button>
            <button type="button" className="hover:text-textSecondary underline-offset-2 hover:underline" onClick={() => setLegal('privacy')}>
              Privacy Policy
            </button>
            <button type="button" className="hover:text-textSecondary underline-offset-2 hover:underline" onClick={() => setLegal('aml')}>
              AML/KYC
            </button>
            <button type="button" className="hover:text-textSecondary underline-offset-2 hover:underline" onClick={() => setLegal('cookies')}>
              Cookies
            </button>
          </div>
          <p className="text-center sm:text-right">© {new Date().getFullYear()} eToro · Демо-интерфейс</p>
        </div>
      </footer>

      <LegalDocModal doc={legal} onClose={() => setLegal(null)} />
    </div>
  );
};

export default LandingPage;
