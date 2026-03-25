import React, { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import AuthFullScreenLayout from '../components/AuthFullScreenLayout';
import LegalDocModal, { LegalDocId } from '../components/LegalDocModal';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';

export const POST_REGISTER_WELCOME_KEY = 'etoro_post_register_welcome_v1';

interface RegisterPageProps {
  refId: string;
  onBack: () => void;
  onSuccess: () => void;
  /** Переключение на экран входа */
  onGoLogin?: () => void;
}

const fieldClass =
  'w-full min-h-[52px] py-3.5 px-4 bg-card border border-border/90 rounded-xl text-textPrimary placeholder:text-textMuted focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30 focus-visible:border-neon/40 text-[16px]';
const labelClass = 'block text-sm font-medium text-textSecondary mb-2';

const RegisterPage: React.FC<RegisterPageProps> = ({ refId, onBack, onSuccess, onGoLogin }) => {
  const { register } = useWebAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTos, setAgreeTos] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<LegalDocId | null>(null);

  const referrerId = parseInt(refId || '0', 10) || 0;

  const displayNameFromEmail = useCallback((em: string) => {
    const local = em.split('@')[0] || 'User';
    return local.replace(/[._+-]+/g, ' ').trim() || 'User';
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.show('Введите корректный email', 'error');
      return;
    }
    if (password.length < 8) {
      toast.show('Пароль — не менее 8 символов', 'error');
      return;
    }
    if (password !== confirmPassword) {
      toast.show('Пароли не совпадают', 'error');
      return;
    }
    if (!agreeTos || !agreePrivacy) {
      toast.show('Примите условия Terms и Privacy', 'error');
      return;
    }

    setLoading(true);
    const fullName = displayNameFromEmail(trimmed);
    const { ok, error } = await register(trimmed, password, fullName, referrerId || 0);
    setLoading(false);

    if (ok) {
      try {
        sessionStorage.setItem(POST_REGISTER_WELCOME_KEY, '1');
      } catch (_) {}
      toast.show('Аккаунт создан', 'success');
      onSuccess();
    } else {
      toast.show(error || 'Ошибка регистрации', 'error');
    }
  };

  return (
    <>
      <AuthFullScreenLayout onBack={onBack} title="Регистрация" subtitle="Укажите email и пароль">
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div>
            <label className={labelClass} htmlFor="reg-email">
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gmail.com"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="reg-pass">
              Пароль
            </label>
            <input
              id="reg-pass"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="reg-pass2">
              Подтвердите пароль
            </label>
            <input
              id="reg-pass2"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторите пароль"
              className={fieldClass}
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreeTos}
              onChange={(e) => setAgreeTos(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border accent-neon"
            />
            <span className="text-sm text-textSecondary leading-snug">
              Я согласен с{' '}
              <button
                type="button"
                className="text-neon hover:underline font-medium"
                onClick={(ev) => {
                  ev.preventDefault();
                  setLegal('tos');
                }}
              >
                Terms of Service
              </button>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border accent-neon"
            />
            <span className="text-sm text-textSecondary leading-snug">
              Я согласен с{' '}
              <button
                type="button"
                className="text-neon hover:underline font-medium"
                onClick={(ev) => {
                  ev.preventDefault();
                  setLegal('privacy');
                }}
              >
                Privacy Policy
              </button>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-neon text-black font-bold text-base shadow-lg shadow-neon/20 hover:bg-neon/90 disabled:opacity-60 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={22} /> : null}
            Create account
          </button>

          <p className="text-center text-sm text-textMuted pt-2">
            Уже есть аккаунт?{' '}
            <button type="button" className="text-neon font-semibold hover:underline" onClick={onGoLogin}>
              Войти
            </button>
          </p>
        </form>
      </AuthFullScreenLayout>
      <LegalDocModal doc={legal} onClose={() => setLegal(null)} />
    </>
  );
};

export default RegisterPage;
