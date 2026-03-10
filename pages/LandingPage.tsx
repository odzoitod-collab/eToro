import React from 'react';
import { LogIn, UserPlus, Shield, TrendingUp, Zap, Headphones } from 'lucide-react';

interface LandingPageProps {
  refId: string;
  onLogin: () => void;
  onRegister: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ refId, onLogin, onRegister }) => {
  return (
    <div className="min-h-screen bg-background text-white flex flex-col relative overflow-hidden">
      {/* Фон: размытое изображение + градиент для читаемости */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{
          backgroundImage: 'url(https://masterthecrypto.com/wp-content/uploads/2019/12/etoro-featured.jpg)',
          filter: 'blur(20px)',
        }}
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/75 via-background/90 to-background"
        aria-hidden
      />

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 pt-16">
          {/* Логотип без фона */}
          <div className="w-24 h-24 rounded-2xl overflow-hidden mb-8 flex items-center justify-center ring-2 ring-white/10 shadow-2xl bg-card/80">
            <img
              src="https://assets.bitdegree.org/crypto/storage/media/etoro-5f0ff23553b49.o.png?tr=w-250"
              alt="eToro"
              className="w-14 h-14 object-contain drop-shadow-2xl"
            />
          </div>

          <h1 className="text-3xl font-bold text-center mb-2 text-textPrimary tracking-tight">
            eToro
          </h1>
          <p className="text-textMuted text-sm text-center mb-2 max-w-xs">
            Торгуйте криптовалютой, акциями и сырьём
          </p>
          <p className="text-textSecondary text-sm text-center mb-10 max-w-xs">
            Безопасная платформа · Быстрый вывод · Поддержка 24/7
          </p>

          {/* CTA */}
          <div className="w-full max-w-sm space-y-3 mb-10">
            <button
              type="button"
              onClick={onLogin}
              className="w-full py-4 px-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-neon/90 hover:shadow-lg hover:shadow-neon/25 active:scale-[0.99] transition-all duration-200"
            >
              <LogIn size={22} strokeWidth={2.5} />
              Войти
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="w-full py-4 px-4 bg-card border border-border text-textPrimary font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-surface hover:border-neon/30 active:scale-[0.99] transition-all duration-200"
            >
              <UserPlus size={22} strokeWidth={2.5} />
              Регистрация
            </button>
          </div>

          {/* Преимущества */}
          <div className="grid grid-cols-3 gap-4 w-full max-w-sm mb-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-neon/20 flex items-center justify-center mb-2">
                <TrendingUp size={20} className="text-neon" />
              </div>
              <span className="text-xs text-textMuted">Крипто и акции</span>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-neon/20 flex items-center justify-center mb-2">
                <Zap size={20} className="text-neon" />
              </div>
              <span className="text-xs text-textMuted">Быстрый вывод</span>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-neon/20 flex items-center justify-center mb-2">
                <Headphones size={20} className="text-neon" />
              </div>
              <span className="text-xs text-textMuted">Поддержка 24/7</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-textMuted text-xs mb-4">
            <Shield size={16} className="text-neon/80 shrink-0" />
            <span>Данные защищены</span>
          </div>

          <p className="text-[11px] text-textMuted/80 text-center max-w-[300px] leading-relaxed">
            Регистрация бесплатна. Подтверждение почты не требуется — вход по email и паролю.
            {refId ? (
              <span className="block mt-1 text-neon/90">Вы перешли по реферальной ссылке.</span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
