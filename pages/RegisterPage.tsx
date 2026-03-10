import React, { useState } from 'react';
import { UserPlus, ArrowRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';

interface RegisterPageProps {
  refId: string;
  onBack: () => void;
  onSuccess: () => void;
}

type Step = 'email' | 'password' | 'name';

const RegisterPage: React.FC<RegisterPageProps> = ({ refId, onBack, onSuccess }) => {
  const { register } = useWebAuth();
  const toast = useToast();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const referrerId = parseInt(refId || '0', 10) || 0;

  const handleEmailNext = () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      toast.show('Введите корректный email', 'error');
      return;
    }
    setEmail(trimmed);
    setPassword('');
    setConfirmPassword('');
    setStep('password');
  };

  const handlePasswordNext = () => {
    if (password.length < 6) {
      toast.show('Пароль должен быть не менее 6 символов', 'error');
      return;
    }
    if (password !== confirmPassword) {
      toast.show('Пароли не совпадают', 'error');
      return;
    }
    setStep('name');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.show('Введите имя', 'error');
      return;
    }
    // referrerId может быть 0 (регистрация без реферальной ссылки)
    setLoading(true);
    const { ok, error } = await register(email, password, fullName.trim(), referrerId || 0);
    setLoading(false);
    if (ok) {
      toast.show('Регистрация успешна', 'success');
      onSuccess();
    } else {
      toast.show(error || 'Ошибка регистрации', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      <PageHeader
        title={`Регистрация — шаг ${step === 'email' ? 1 : step === 'password' ? 2 : 3}`}
        onBack={() => {
          if (step === 'email') onBack();
          else if (step === 'password') {
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setStep('email');
          } else setStep('password');
        }}
      />
      <div className="flex-1 px-6 py-8">
        <form onSubmit={(e) => { e.preventDefault(); step === 'email' ? handleEmailNext() : step === 'password' ? handlePasswordNext() : handleSubmit(e); }} className="space-y-4 max-w-sm mx-auto">
          {step === 'email' && (
            <>
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  autoComplete="email"
                  autoFocus
                  className="w-full py-3 px-4 bg-card border border-border rounded-xl text-white placeholder-textSecondary focus:border-neon focus:outline-none"
                />
              </div>
              <button type="submit" className="w-full py-3.5 px-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-neon/90 active:scale-[0.99] transition-all">
                Далее <ArrowRight size={18} />
              </button>
            </>
          )}

          {step === 'password' && (
            <>
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Не менее 6 символов"
                  autoComplete="new-password"
                  autoFocus
                  className="w-full py-3 px-4 bg-card border border-border rounded-xl text-white placeholder-textSecondary focus:border-neon focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5">Подтвердите пароль</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Введите пароль еще раз"
                  autoComplete="new-password"
                  className="w-full py-3 px-4 bg-card border border-border rounded-xl text-white placeholder-textSecondary focus:border-neon focus:outline-none"
                />
              </div>
              <button type="submit" className="w-full py-3.5 px-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-neon/90 active:scale-[0.99] transition-all">
                Далее <ArrowRight size={18} />
              </button>
            </>
          )}

          {step === 'name' && (
            <>
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5">Имя</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Как к вам обращаться"
                  autoComplete="name"
                  autoFocus
                  className="w-full py-3 px-4 bg-card border border-border rounded-xl text-white placeholder-textSecondary focus:border-neon focus:outline-none"
                />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3.5 px-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-neon/90 disabled:opacity-60 active:scale-[0.99] transition-all">
                <UserPlus size={20} />
                {loading ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
