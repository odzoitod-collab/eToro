import React, { useState, useCallback } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import AuthFullScreenLayout from '../components/AuthFullScreenLayout';
import LegalDocModal, { LegalDocId } from '../components/LegalDocModal';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

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
const errorTextClass = 'mt-2 text-xs text-red-400';
const errorFieldClass = 'border-red-500/60 focus-visible:ring-red-500/20 focus-visible:border-red-500/60';

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim().toLowerCase());
}

function validatePassword(pw: string) {
  const v = {
    len: pw.length >= 8,
    upper: /[A-ZА-Я]/.test(pw),
    lower: /[a-zа-я]/.test(pw),
    num: /\d/.test(pw),
    sym: /[^A-Za-zА-Яа-я0-9]/.test(pw),
  };
  return v;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ refId, onBack, onSuccess, onGoLogin }) => {
  const { register, login, resendEmailConfirmation } = useWebAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTos, setAgreeTos] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<LegalDocId | null>(null);
  const [step, setStep] = useState<'form' | 'confirm_email'>('form');
  const [resending, setResending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [pass2Error, setPass2Error] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rateLimitCooldown, setRateLimitCooldown] = useState(0);
  const cooldownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((seconds: number) => {
    setRateLimitCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setRateLimitCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const referrerId = parseInt(refId || '0', 10) || 0;

  const displayNameFromEmail = useCallback((em: string) => {
    const local = em.split('@')[0] || 'User';
    return local.replace(/[._+-]+/g, ' ').trim() || 'User';
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (step !== 'form') return;
    const trimmed = email.trim().toLowerCase();
    setEmailError(null);
    setPassError(null);
    setPass2Error(null);
    if (!trimmed) setEmailError('Введите email');
    else if (!isValidEmail(trimmed)) setEmailError('Email выглядит неверно (пример: name@gmail.com)');
    const pv = validatePassword(password);
    if (!password) setPassError('Введите пароль');
    else if (!pv.len) setPassError('Пароль должен быть не короче 8 символов');
    if (!confirmPassword) setPass2Error('Повторите пароль');
    else if (password !== confirmPassword) setPass2Error('Пароли не совпадают');
    if (!trimmed || !isValidEmail(trimmed) || !pv.len || password !== confirmPassword) {
      toast.show('Проверьте поля ввода', 'error');
      return;
    }
    if (!agreeTos || !agreePrivacy) {
      toast.show('Примите условия Terms и Privacy', 'error');
      return;
    }

    setLoading(true);
    const fullName = displayNameFromEmail(trimmed);
    const { ok, error, requiresEmailConfirmation } = await register(trimmed, password, fullName, referrerId || 0);
    setLoading(false);

    if (ok) {
      if (requiresEmailConfirmation) {
        setStep('confirm_email');
        setShowConfirmModal(true);
        toast.show('Мы отправили письмо для подтверждения email. Проверьте почту.', 'success');
        return;
      }
      try {
        sessionStorage.setItem(POST_REGISTER_WELCOME_KEY, '1');
      } catch (_) {}
      toast.show('Аккаунт создан', 'success');
      onSuccess();
    } else {
      const isRateLimit = error?.toLowerCase().includes('слишком много') || error?.toLowerCase().includes('rate limit');
      if (isRateLimit) startCooldown(90);
      toast.show(error || 'Ошибка регистрации', 'error');
    }
  };

  return (
    <>
      <AuthFullScreenLayout onBack={onBack} title="Регистрация" subtitle="Укажите email и пароль">
        {step === 'form' ? (
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
              className={`${fieldClass} ${emailError ? errorFieldClass : ''}`}
            />
            {emailError ? <div className={errorTextClass}>{emailError}</div> : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="reg-pass">
              {t('password_label')}
            </label>
            <div className="relative">
              <input
                id="reg-pass"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                className={`${fieldClass} pr-12 ${passError ? errorFieldClass : ''}`}
              />
              <button
                type="button"
                aria-label={showPassword ? t('hide_password') : t('show_password')}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passError ? <div className={errorTextClass}>{passError}</div> : null}
            <div className="mt-2 text-xs text-textMuted">
              Подсказка: добавьте цифру и символ (например, <span className="font-mono text-white">A1!</span>), чтобы пароль был надёжнее.
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="reg-pass2">
              {t('confirm_password_label')}
            </label>
            <div className="relative">
              <input
                id="reg-pass2"
                type={showPassword2 ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                className={`${fieldClass} pr-12 ${pass2Error ? errorFieldClass : ''}`}
              />
              <button
                type="button"
                aria-label={showPassword2 ? t('hide_password') : t('show_password')}
                onClick={() => setShowPassword2((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary transition-colors"
              >
                {showPassword2 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {pass2Error ? <div className={errorTextClass}>{pass2Error}</div> : null}
          </div>

          <label className="flex items-start gap-3 cursor-pointer group min-h-[44px]">
            <input
              type="checkbox"
              checked={agreeTos}
              onChange={(e) => setAgreeTos(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-border accent-neon flex-shrink-0"
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
          <label className="flex items-start gap-3 cursor-pointer group min-h-[44px]">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-border accent-neon flex-shrink-0"
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
            disabled={loading || rateLimitCooldown > 0}
            className="w-full py-4 rounded-2xl bg-neon text-black font-bold text-base shadow-lg shadow-neon/20 hover:bg-neon/90 disabled:opacity-60 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={22} /> : null}
            {rateLimitCooldown > 0 ? `Подождите ${rateLimitCooldown}с…` : t('create_account')}
          </button>

          <p className="text-center text-sm text-textMuted pt-2">
            Уже есть аккаунт?{' '}
            <button type="button" className="text-neon font-semibold hover:underline" onClick={onGoLogin}>
              Войти
            </button>
          </p>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="text-lg font-bold text-textPrimary">Подтвердите email</h2>
              <p className="text-sm text-textSecondary mt-2 leading-relaxed">
                Мы отправили письмо на <span className="font-mono text-white">{email.trim().toLowerCase()}</span>.
                Перейдите по ссылке <span className="font-semibold text-white">Confirm your mail</span> в письме — после этого вы автоматически попадёте в аккаунт на бирже.
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  // Проверяем, подтвердил ли email пользователь.
                  setLoading(true);
                  const res = await login(email, password);
                  setLoading(false);
                  if (res.ok) {
                    try {
                      sessionStorage.setItem(POST_REGISTER_WELCOME_KEY, '1');
                    } catch (_) {}
                    onSuccess();
                  } else {
                    toast.show(res.error || 'Сначала подтвердите email', 'error');
                  }
                }}
                className="w-full py-4 rounded-2xl bg-neon text-black font-bold text-base shadow-lg shadow-neon/20 hover:bg-neon/90 disabled:opacity-60 active:scale-[0.99] transition-all"
              >
                Я подтвердил email
              </button>
              <button
                type="button"
                disabled={resending}
                onClick={async () => {
                  if (!resendEmailConfirmation) return;
                  setResending(true);
                  const res = await resendEmailConfirmation(email);
                  setResending(false);
                  if (!res.ok) toast.show(res.error || 'Ошибка', 'error');
                  else toast.show('Письмо отправлено повторно', 'success');
                }}
                className="w-full py-3 rounded-2xl border border-border bg-card text-textPrimary font-semibold active:scale-[0.99] transition-all hover:bg-surface"
              >
                {resending ? 'Отправляем…' : 'Отправить письмо ещё раз'}
              </button>
            </div>
          </div>
        )}
      </AuthFullScreenLayout>

      {showConfirmModal ? (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Закрыть"
            onClick={() => setShowConfirmModal(false)}
          />
          <div className="relative w-full sm:max-w-md mx-auto rounded-t-3xl sm:rounded-3xl border border-border bg-surface p-5 shadow-2xl">
            <div className="text-lg font-bold text-textPrimary">Подтвердите аккаунт в Gmail</div>
            <div className="mt-2 text-sm text-textSecondary leading-relaxed">
              Откройте приложение Gmail и нажмите <span className="font-semibold text-white">Confirm your mail</span>.
              После подтверждения вы автоматически войдёте в аккаунт на бирже.
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href={'https://mail.google.com/'}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-2xl bg-neon text-black font-bold text-base shadow-lg shadow-neon/20 hover:bg-neon/90 active:scale-[0.99] transition-all text-center"
              >
                Открыть Gmail
              </a>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  toast.show('После подтверждения вы войдёте автоматически. Если нет — нажмите «Я подтвердил email».', 'success');
                }}
                className="w-full py-3 rounded-2xl border border-border bg-card text-textPrimary font-semibold active:scale-[0.99] transition-all hover:bg-surface"
              >
                Я подтвержу сейчас
              </button>
              <button
                type="button"
                disabled={resending}
                onClick={async () => {
                  if (!resendEmailConfirmation) return;
                  setResending(true);
                  const res = await resendEmailConfirmation(email);
                  setResending(false);
                  if (!res.ok) toast.show(res.error || 'Ошибка', 'error');
                  else toast.show('Письмо отправлено повторно', 'success');
                }}
                className="w-full py-3 rounded-2xl border border-border bg-transparent text-textSecondary font-semibold active:scale-[0.99] transition-all hover:bg-card/60 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resending ? 'Отправляем…' : 'Отправить письмо ещё раз'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LegalDocModal doc={legal} onClose={() => setLegal(null)} />
    </>
  );
};

export default RegisterPage;
