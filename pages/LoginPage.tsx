import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';

interface LoginPageProps {
  onBack: () => void;
  onSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onBack, onSuccess }) => {
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
    <div className="min-h-screen bg-background text-white flex flex-col">
      <PageHeader title="Вход" onBack={onBack} />
      <div className="flex-1 px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-xs text-neutral-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              autoComplete="email"
              className="w-full min-h-[48px] py-3 px-4 bg-card border border-border rounded-xl text-white placeholder-textSecondary focus:border-neon focus:outline-none text-[16px]"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1.5">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full min-h-[48px] py-3 px-4 bg-card border border-border rounded-xl text-white placeholder-textSecondary focus:border-neon focus:outline-none text-[16px]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-neon/90 disabled:opacity-60 disabled:pointer-events-none active:scale-[0.99] transition-all"
          >
            {loading ? (
              <>
                <LogIn size={20} className="animate-spin" />
                <span>Вход...</span>
              </>
            ) : (
              <>
                <LogIn size={20} />
                <span>Войти</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
