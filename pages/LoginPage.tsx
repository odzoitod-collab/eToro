import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import AuthFullScreenLayout from '../components/AuthFullScreenLayout';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';

interface LoginPageProps {
  onBack: () => void;
  onSuccess: () => void;
  onGoRegister?: () => void;
}

const fieldClass =
  'w-full min-h-[52px] py-3.5 px-4 bg-card border border-border/90 rounded-xl text-textPrimary placeholder:text-textMuted focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30 focus-visible:border-neon/40 text-[16px]';
const labelClass = 'block text-sm font-medium text-textSecondary mb-2';

const LoginPage: React.FC<LoginPageProps> = ({ onBack, onSuccess, onGoRegister }) => {
  const { login } = useWebAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.show('Введите email и пароль', 'error');
      return;
    }
    setLoading(true);
    const { ok, error } = await login(email.trim(), password);
    setLoading(false);
    if (ok) {
      toast.show('Вход выполнен', 'success');
      onSuccess();
    } else {
      toast.show(error || 'Ошибка входа', 'error');
    }
  };

  return (
    <AuthFullScreenLayout onBack={onBack} title="Вход" subtitle="Войдите в аккаунт eToro">
      <form onSubmit={handleSubmit} className="space-y-5 pt-2">
        <div>
          <label className={labelClass} htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
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
          <label className={labelClass} htmlFor="login-pass">
            Пароль
          </label>
          <input
            id="login-pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={fieldClass}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="text-sm text-neon font-medium hover:underline"
            onClick={() => toast.show('Восстановление пароля: обратитесь в поддержку.', 'error')}
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-neon text-black font-bold text-base shadow-lg shadow-neon/20 hover:bg-neon/90 disabled:opacity-60 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={22} /> : null}
          Login
        </button>
      </form>

      <p className="text-center text-sm text-textMuted mt-10 pb-4">
        Нет аккаунта?{' '}
        <button type="button" className="text-neon font-semibold hover:underline" onClick={onGoRegister}>
          Зарегистрироваться
        </button>
      </p>
    </AuthFullScreenLayout>
  );
};

export default LoginPage;
