import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getSupabaseErrorMessage } from '../lib/supabaseError';
import { logAction } from '../lib/appLog';
import { sendReferralRegisteredToWorker, sendReferralLoginToWorker } from '../lib/telegramNotify';

const STORAGE_KEY = 'etoro_web_user_id';
const PENDING_EMAIL_KEY = 'etoro_pending_email_v1';
const PENDING_PASS_KEY = 'etoro_pending_pass_v1';
const PENDING_FLAG_KEY = 'etoro_pending_confirm_v1';

interface WebAuthContextValue {
  webUserId: number | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    fullName: string,
    referrerId: number
  ) => Promise<{ ok: boolean; error?: string; requiresEmailConfirmation?: boolean }>;
  resendEmailConfirmation?: (email: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const WebAuthContext = createContext<WebAuthContextValue | null>(null);

export function WebAuthProvider({ children }: { children: React.ReactNode }) {
  const rpcLoginWebUser = useCallback(async (email: string, password: string) => {
    // В разных базах функция могла быть создана с разными именами аргументов.
    const attempts: Array<Record<string, unknown>> = [
      { p_email: email, p_password: password },
      { email, password },
      { p_email: email, password },
      { email, p_password: password },
    ];
    let lastError: any = null;
    for (const params of attempts) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.rpc('login_web_user', params as any);
      if (!error && data) return { ok: true as const, data };
      lastError = error;
      // 400 — часто “не подошли аргументы”, пробуем дальше
    }
    return { ok: false as const, error: lastError };
  }, []);

  const [webUserId, setWebUserId] = useState<number | null>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return parseInt(s, 10);
    } catch {}
    return null;
  });

  // Автовход после подтверждения email по ссылке Supabase:
  // 1) обмениваем `code`/`access_token` на сессию
  // 2) если регистрация была в этом браузере, берём email+пароль из sessionStorage и логиним в вашу БД (RPC), получаем user_id
  useEffect(() => {
    let alive = true;
    (async () => {
      if (webUserId) return;
      if (typeof window === 'undefined') return;

      const url = new URL(window.location.href);
      const search = url.searchParams;
      const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
      const code = search.get('code');
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');

      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          search.delete('code');
          search.delete('type');
          search.delete('next');
          url.hash = '';
          window.history.replaceState({}, '', `${url.pathname}${search.toString() ? `?${search.toString()}` : ''}`);
        } else if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
          url.hash = '';
          window.history.replaceState({}, '', `${url.pathname}${url.search}`);
        }
      } catch {
        // Если обмен не удался — не блокируем UX, пользователь сможет зайти вручную
      }

      // Если у нас есть “ожидающие” креды после регистрации — логиним пользователя автоматически
      try {
        const pendingFlag = sessionStorage.getItem(PENDING_FLAG_KEY) === '1';
        const pendingEmail = sessionStorage.getItem(PENDING_EMAIL_KEY) || '';
        const pendingPass = sessionStorage.getItem(PENDING_PASS_KEY) || '';
        if (!pendingFlag || !pendingEmail || !pendingPass) return;

        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) return; // ещё не подтверждено / нет сессии

        const rpc = await rpcLoginWebUser(pendingEmail.trim().toLowerCase(), pendingPass);
        if (!rpc.ok) return;
        const u = rpc.data as { user_id?: number };
        if (!u?.user_id) return;

        if (!alive) return;
        setWebUserId(u.user_id);
        localStorage.setItem(STORAGE_KEY, String(u.user_id));
        sessionStorage.removeItem(PENDING_FLAG_KEY);
        sessionStorage.removeItem(PENDING_EMAIL_KEY);
        sessionStorage.removeItem(PENDING_PASS_KEY);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [webUserId, rpcLoginWebUser]);

  const login = useCallback(async (email: string, password: string) => {
    // 1) Supabase Auth — используем как gating email confirmation
    const normalizedEmail = email.trim().toLowerCase();
    const authRes = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (authRes.error) {
      const msg = authRes.error.message?.toLowerCase() ?? '';
      // Типовые сообщения: "Email not confirmed", "confirmation required" и т.п.
      if (msg.includes('confirm') && (msg.includes('email') || msg.includes('e-mail'))) {
        return { ok: false, error: 'Подтвердите email. Мы отправили письмо на вашу почту.' };
      }
      if (msg.includes('not found') || msg.includes('invalid') || msg.includes('credentials')) {
        // Наследие: у старых пользователей может не быть Supabase Auth аккаунта.
        // Пробуем ваш RPC login_web_user как fallback.
      } else {
        return { ok: false, error: getSupabaseErrorMessage(authRes.error, 'Не удалось выполнить вход') };
      }
    } else {
      // 2) Если Auth вход успешен — значит email подтверждён (или подтверждение не требуется).
      // Дальше подтягиваем user_id из вашей БД через RPC.
      const rpc = await rpcLoginWebUser(normalizedEmail, password);
      if (!rpc.ok) {
        const rpcMsg = rpc.error ? getSupabaseErrorMessage(rpc.error, 'Неверный email или пароль') : 'Неверный email или пароль';
        return { ok: false, error: rpcMsg };
      }
      const u = rpc.data as { user_id?: number };
      if (u?.user_id) {
        setWebUserId(u.user_id);
        localStorage.setItem(STORAGE_KEY, String(u.user_id));
        try {
          sessionStorage.removeItem(PENDING_FLAG_KEY);
          sessionStorage.removeItem(PENDING_EMAIL_KEY);
          sessionStorage.removeItem(PENDING_PASS_KEY);
        } catch {}
        logAction('login', { userId: u.user_id, payload: { email: normalizedEmail } }).catch(() => {});
        supabase
          .from('users')
          .select('referrer_id, full_name, username')
          .eq('user_id', u.user_id)
          .single()
          .then(({ data: row }) => {
            const r = row as { referrer_id?: number | null; full_name?: string | null; username?: string | null } | null;
            if (r?.referrer_id && r.referrer_id > 0) {
              sendReferralLoginToWorker(r.referrer_id, {
                user_id: u.user_id,
                email: email.trim(),
                username: (r.username || '').trim() || undefined,
                full_name: (r.full_name || '').trim() || undefined,
              }).catch(() => {});
            }
          })
          .catch(() => {});
        return { ok: true };
      }
      return { ok: false, error: getSupabaseErrorMessage(null, 'Неверный email или пароль') };
    }

    // Fallback (legacy): login_web_user
    const rpc = await rpcLoginWebUser(normalizedEmail, password);
    if (!rpc.ok) {
      const msg = rpc.error ? getSupabaseErrorMessage(rpc.error, 'Неверный email или пароль') : 'Неверный email или пароль';
      return { ok: false, error: msg };
    }
    const u = rpc.data as { user_id?: number };
    if (u?.user_id) {
      setWebUserId(u.user_id);
      localStorage.setItem(STORAGE_KEY, String(u.user_id));
      try {
        sessionStorage.removeItem(PENDING_FLAG_KEY);
        sessionStorage.removeItem(PENDING_EMAIL_KEY);
        sessionStorage.removeItem(PENDING_PASS_KEY);
      } catch {}
      logAction('login', { userId: u.user_id, payload: { email: normalizedEmail } }).catch(() => {});
      return { ok: true };
    }
    return { ok: false, error: getSupabaseErrorMessage(null, 'Неверный email или пароль') };
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string, referrerId: number) => {
    const normalizedEmail = email.trim().toLowerCase();

    // 1) Supabase Auth (отправка письма подтверждения)
    const authRes = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        data: {
          full_name: fullName.trim(),
          referrer_id: referrerId || 0,
        },
      },
    });

    if (authRes.error) {
      const status =
        (authRes.error as any)?.status ??
        (authRes.error as any)?.code ??
        (authRes.error as any)?.statusCode;
      const msg = authRes.error.message?.toLowerCase() ?? '';
      if (status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
        return { ok: false, error: 'Слишком много попыток регистрации. Подождите 1–2 минуты и попробуйте снова.' };
      }
      if (msg.includes('already') && (msg.includes('registered') || msg.includes('exists'))) {
        return { ok: false, error: 'Этот email уже зарегистрирован' };
      }
      return { ok: false, error: getSupabaseErrorMessage(authRes.error, 'Ошибка регистрации') };
    }

    const requiresEmailConfirmation = !authRes.data?.session;

    // 2) Ваш RPC — создаём строку пользователя в таблице users
    const { data, error } = await supabase.rpc('register_web_user', {
      p_email: normalizedEmail,
      p_password: password,
      p_full_name: fullName,
      p_referrer_id: referrerId,
    });
    if (error) return { ok: false, error: getSupabaseErrorMessage(error, 'Ошибка регистрации') };

    const d = data as { error?: string; user_id?: number };
    if (d?.error === 'EMAIL_EXISTS') return { ok: false, error: 'Этот email уже зарегистрирован' };

    if (d?.user_id) {
      // Важно: если нужно подтверждение email — НЕ логиним пользователя в приложение,
      // чтобы он не прошёл в PIN/сайт без верификации.
      if (requiresEmailConfirmation) {
        try {
          sessionStorage.setItem(PENDING_FLAG_KEY, '1');
          sessionStorage.setItem(PENDING_EMAIL_KEY, normalizedEmail);
          sessionStorage.setItem(PENDING_PASS_KEY, password);
        } catch {}
        return { ok: true, requiresEmailConfirmation: true };
      }

      setWebUserId(d.user_id);
      localStorage.setItem(STORAGE_KEY, String(d.user_id));
      logAction('register', { userId: d.user_id, payload: { email: normalizedEmail, referrerId } }).catch(() => {});
      if (referrerId > 0) {
        sendReferralRegisteredToWorker(referrerId, {
          user_id: d.user_id,
          email: normalizedEmail,
          full_name: fullName.trim(),
        }).catch(() => {});
      }
      return { ok: true };
    }

    return { ok: false, error: 'Ошибка регистрации' };
  }, []);

  const resendEmailConfirmation = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const res = await supabase.auth.resend({ type: 'signup', email: normalizedEmail });
    if (res.error) return { ok: false, error: getSupabaseErrorMessage(res.error, 'Не удалось отправить письмо') };
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    setWebUserId(null);
    localStorage.removeItem(STORAGE_KEY);
    supabase.auth.signOut().catch(() => {});
  }, []);

  const value: WebAuthContextValue = { webUserId, login, register, resendEmailConfirmation, logout };
  return <WebAuthContext.Provider value={value}>{children}</WebAuthContext.Provider>;
}

export function useWebAuth() {
  const ctx = useContext(WebAuthContext);
  if (!ctx) throw new Error('useWebAuth must be used within WebAuthProvider');
  return ctx;
}
