import React from 'react';
import { Wallet, CreditCard, X } from 'lucide-react';
import { ETORO_LOGO_URL } from '../constants';
import { Haptic } from '../utils/haptics';

interface PostRegisterWelcomeProps {
  onDeposit: () => void;
  onBuyCrypto: () => void;
  onDismiss: () => void;
}

/**
 * После регистрации — нижний шит в стиле биржи: без «неона» и градиентов, затемнение + панель снизу.
 */
const PostRegisterWelcome: React.FC<PostRegisterWelcomeProps> = ({ onDeposit, onBuyCrypto, onDismiss }) => {
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    Haptic.light();
    onDismiss();
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{
        zIndex: 280,
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-reg-welcome-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Закрыть"
        onClick={handleBackdrop}
      />

      <div
        className="relative w-full max-w-md bg-card border-t border-x border-border rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.35)] animate-sheet-up overflow-hidden max-h-[min(90dvh,640px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-border min-h-[52px] shrink-0 bg-surface/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={ETORO_LOGO_URL}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-cover border border-border shrink-0"
            />
            <span id="post-reg-welcome-title" className="text-base font-semibold text-textPrimary truncate">
              Добро пожаловать
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              Haptic.light();
              onDismiss();
            }}
            className="touch-target shrink-0 p-2 rounded-lg text-textMuted hover:text-textPrimary hover:bg-background/80 transition-colors"
            aria-label="Закрыть"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-app px-4 py-5 space-y-5">
          <p className="text-sm text-textSecondary leading-relaxed">
            Пополните счёт, чтобы начать торговлю.
          </p>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                Haptic.medium();
                onDeposit();
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-neon text-black font-semibold text-sm flex items-center justify-center gap-2 active:opacity-90 transition-opacity"
            >
              <Wallet size={20} strokeWidth={2} />
              Пополнить счёт
            </button>
            <button
              type="button"
              onClick={() => {
                Haptic.medium();
                onBuyCrypto();
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-surface border border-border text-textPrimary font-medium text-sm flex items-center justify-center gap-2 hover:bg-card transition-colors"
            >
              <CreditCard size={20} strokeWidth={2} />
              Купить криптовалюту
            </button>
            <button
              type="button"
              onClick={() => {
                Haptic.light();
                onDismiss();
              }}
              className="w-full py-3 text-sm font-medium text-textMuted hover:text-textSecondary transition-colors"
            >
              Позже
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostRegisterWelcome;
