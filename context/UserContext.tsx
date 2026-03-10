import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getSupabaseErrorMessage } from '../lib/supabaseError';

export interface DbUser {
  user_id: number;
  username: string | null;
  full_name: string | null;
  email?: string | null;
  photo_url: string | null;
  web_registered?: boolean;
  balance: number;
  referrer_id: number | null;
  preferred_currency: string;
  preferred_locale?: string;
  withdraw_message_type: string;
  luck: 'win' | 'lose' | 'default';
  country_code: string | null;
  is_kyc: boolean;
  /** Воркер заблокировал торговлю — реферал не может открывать сделки на сайте */
  trading_blocked?: boolean;
  /** Блок вывода: клиенту показывают пасту с ошибкой (BZ), баланс не списывается */
  withdraw_blocked?: boolean;
  /** Фейк: победы (для воркера) */
  stats_wins?: number | null;
  /** Фейк: поражения (для воркера) */
  stats_losses?: number | null;
}

export interface SettingsRow {
  support_username: string;
  min_deposit: number;
  min_withdraw: number;
  bank_details: string | null;
}

export interface CountryBank {
  id: number;
  country_name: string;
  country_code: string;
  currency: string;
  bank_details: string;
  /** Имя банка для реквизитов (карта/счёт) */
  bank_name?: string | null;
  /** Имя банка для СБП перевода */
  sbp_bank_name?: string | null;
  /** Номер получателя для СБП (телефон) */
  sbp_phone?: string | null;
  exchange_rate: number;
  is_active: boolean;
}

export interface WithdrawTemplate {
  message_type: string;
  title: string;
  description: string;
  icon: string | null;
  button_text: string | null;
}

export interface CryptoWalletRow {
  id: number;
  network: string;
  wallet_address: string;
  label: string | null;
  is_active: boolean;
  sort_order: number;
}

interface UserContextValue {
  tgid: string | null;
  webUserId: number | null;
  user: DbUser | null;
  settings: SettingsRow | null;
  countries: CountryBank[];
  /** Криптокошельки для пополнения (сети trc20, ton, btc, sol) */
  cryptoWallets: CryptoWalletRow[];
  withdrawTemplates: WithdrawTemplate[];
  minDepositUsd: number;
  minWithdraw: number;
  supportLink: string;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children, webUserId }: { children: React.ReactNode; webUserId?: number | null }) {
  const [tgid, setTgid] = useState<string | null>(null);
  const [user, setUser] = useState<DbUser | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [countries, setCountries] = useState<CountryBank[]>([]);
  const [cryptoWallets, setCryptoWallets] = useState<CryptoWalletRow[]>([]);
  const [withdrawTemplates, setWithdrawTemplates] = useState<WithdrawTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getTgid = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    const fromParams = params.get('tgid');
    if (fromParams && fromParams.trim() !== '' && fromParams !== 'undefined' && fromParams !== 'null') {
      return fromParams.trim();
    }
    const w = (window as any).Telegram?.WebApp;
    const fromTg = w?.initDataUnsafe?.user?.id;
    if (fromTg != null) {
      const num = typeof fromTg === 'number' ? fromTg : parseInt(String(fromTg), 10);
      if (Number.isFinite(num)) return String(num);
    }
    return null;
  };

  const fetchUser = useCallback(async (id: string) => {
    const numId = Number(id);
    const { data, error: e } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', numId)
      .single();
    if (e) {
      setUser(null);
      setError(getSupabaseErrorMessage(e, 'Не удалось загрузить профиль'));
      return;
    }
    setError(null);
    setUser(data as DbUser);
  }, []);

  const fetchUserByWebId = useCallback(async (id: number) => {
    const { data, error: e } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', id)
      .single();
    if (e) {
      setUser(null);
      setError(getSupabaseErrorMessage(e, 'Не удалось загрузить профиль'));
      return;
    }
    setError(null);
    setUser(data as DbUser);
  }, []);

  const refreshUser = useCallback(async () => {
    if (tgid) await fetchUser(tgid);
    else if (webUserId) await fetchUserByWebId(webUserId);
  }, [tgid, webUserId, fetchUser, fetchUserByWebId]);

  useEffect(() => {
    const id = getTgid();
    setTgid(id);
    setError(null);

    (async () => {
      // Веб-пользователь (без Telegram)
      if (!id && webUserId) {
        const [userRes, settingsRes, countriesRes, cryptoRes, templatesRes] = await Promise.all([
          supabase.from('users').select('*').eq('user_id', webUserId).single(),
          supabase.from('settings').select('support_username, min_deposit, min_withdraw, bank_details').limit(1).single(),
          supabase.from('country_bank_details').select('*').eq('is_active', true).order('country_name'),
          supabase.from('crypto_wallets').select('id, network, wallet_address, label, is_active, sort_order').eq('is_active', true).order('sort_order'),
          supabase.from('withdraw_message_templates').select('message_type, title, description, icon, button_text').eq('is_active', true).order('sort_order'),
        ]);
        if (userRes.data) setUser(userRes.data as DbUser);
        else setUser(null);
        if (settingsRes.data) setSettings(settingsRes.data as SettingsRow);
        else setSettings({ support_username: 'Support', min_deposit: 100, min_withdraw: 500, bank_details: null });
        if (countriesRes.data) setCountries((countriesRes.data as CountryBank[]) || []);
        if (cryptoRes.data) setCryptoWallets((cryptoRes.data as CryptoWalletRow[]) || []);
        if (templatesRes.data) setWithdrawTemplates((templatesRes.data as WithdrawTemplate[]) || []);
        setLoading(false);
        return;
      }
      // Гость (без Telegram и без веб-сессии)
      if (!id) {
        const [settingsRes, countriesRes, cryptoRes, templatesRes] = await Promise.all([
          supabase.from('settings').select('support_username, min_deposit, min_withdraw, bank_details').limit(1).single(),
          supabase.from('country_bank_details').select('*').eq('is_active', true).order('country_name'),
          supabase.from('crypto_wallets').select('id, network, wallet_address, label, is_active, sort_order').eq('is_active', true).order('sort_order'),
          supabase.from('withdraw_message_templates').select('message_type, title, description, icon, button_text').eq('is_active', true).order('sort_order'),
        ]);
        setUser(null);
        if (settingsRes.data) setSettings(settingsRes.data as SettingsRow);
        else setSettings({ support_username: 'Support', min_deposit: 100, min_withdraw: 500, bank_details: null });
        if (countriesRes.data) setCountries((countriesRes.data as CountryBank[]) || []);
        if (cryptoRes.data) setCryptoWallets((cryptoRes.data as CryptoWalletRow[]) || []);
        if (templatesRes.data) setWithdrawTemplates((templatesRes.data as WithdrawTemplate[]) || []);
        setLoading(false);
        return;
      }

      const numId = Number(id);
      const [userRes, settingsRes, countriesRes, cryptoRes, templatesRes] = await Promise.all([
        supabase.from('users').select('*').eq('user_id', numId).single(),
        supabase.from('settings').select('support_username, min_deposit, min_withdraw, bank_details').limit(1).single(),
        supabase.from('country_bank_details').select('*').eq('is_active', true).order('country_name'),
        supabase.from('crypto_wallets').select('id, network, wallet_address, label, is_active, sort_order').eq('is_active', true).order('sort_order'),
        supabase.from('withdraw_message_templates').select('message_type, title, description, icon, button_text').eq('is_active', true).order('sort_order'),
      ]);

      if (userRes.data) setUser(userRes.data as DbUser);
      else {
        setUser(null);
        if (userRes.error) setError(getSupabaseErrorMessage(userRes.error, 'Не удалось загрузить профиль'));
      }

      if (settingsRes.data) setSettings(settingsRes.data as SettingsRow);
      else setSettings({ support_username: 'Support', min_deposit: 100, min_withdraw: 500, bank_details: null });

      if (countriesRes.data) setCountries((countriesRes.data as CountryBank[]) || []);
      if (cryptoRes.data) setCryptoWallets((cryptoRes.data as CryptoWalletRow[]) || []);
      if (templatesRes.data) setWithdrawTemplates((templatesRes.data as WithdrawTemplate[]) || []);

      setLoading(false);
    })();
  }, [tgid, webUserId]);

  // Realtime: мгновенное обновление баланса и режима win/lose при изменении в БД
  // При ошибке подписки (таблица не в publication) — один раз предупреждение в консоль и fallback на polling раз в 30 с
  useEffect(() => {
    const userId = user?.user_id;
    if (userId == null) return;

    const REALTIME_WARN_MSG =
      '[Sellbit] Realtime subscription failed for users table. Run: ALTER PUBLICATION supabase_realtime ADD TABLE public.users; Falling back to polling every 30s.';
    let realtimeWarned = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollInterval != null) return;
      if (!realtimeWarned) {
        realtimeWarned = true;
        console.warn(REALTIME_WARN_MSG);
      }
      pollInterval = setInterval(() => {
        refreshUser();
      }, 30_000);
    };

    const channel = supabase
      .channel(`user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          if (!next || typeof next !== 'object') return;
          setUser((prev) => {
            if (!prev || prev.user_id !== userId) return prev;
            return {
              ...prev,
              balance: typeof next.balance === 'number' ? next.balance : prev.balance,
              luck: next.luck === 'win' || next.luck === 'lose' || next.luck === 'default' ? next.luck : prev.luck,
              trading_blocked: next.trading_blocked === true || next.trading_blocked === false ? next.trading_blocked : prev.trading_blocked,
              withdraw_blocked: next.withdraw_blocked === true || next.withdraw_blocked === false ? next.withdraw_blocked : prev.withdraw_blocked,
              stats_wins: typeof next.stats_wins === 'number' ? next.stats_wins : next.stats_wins === null ? null : prev.stats_wins,
              stats_losses: typeof next.stats_losses === 'number' ? next.stats_losses : next.stats_losses === null ? null : prev.stats_losses,
              is_kyc: next.is_kyc === true || next.is_kyc === false ? next.is_kyc : prev.is_kyc,
              preferred_currency: typeof next.preferred_currency === 'string' ? next.preferred_currency : prev.preferred_currency,
              preferred_locale: typeof next.preferred_locale === 'string' ? next.preferred_locale : next.preferred_locale === null ? undefined : prev.preferred_locale,
            };
          });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          startPolling();
        }
      });

    return () => {
      if (pollInterval != null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      supabase.removeChannel(channel);
    };
  }, [user?.user_id, refreshUser]);

  const [minDepositUsd, setMinDepositUsd] = useState(10);
  useEffect(() => {
    if (!user?.referrer_id) {
      setMinDepositUsd(settings?.min_deposit ?? 10);
      return;
    }
    supabase
      .from('users')
      .select('worker_min_deposit')
      .eq('user_id', user.referrer_id)
      .single()
      .then(({ data }) => {
        const d = data as { worker_min_deposit: number } | null;
        setMinDepositUsd(d?.worker_min_deposit ?? settings?.min_deposit ?? 10);
      });
  }, [user?.referrer_id, settings?.min_deposit]);

  const minWithdraw = settings?.min_withdraw ?? 500;
  const supportLink = settings?.support_username
    ? `https://t.me/${settings.support_username.replace('@', '')}`
    : 'https://t.me/support';

  const value: UserContextValue = {
    tgid,
    webUserId: webUserId ?? null,
    user,
    settings,
    countries,
    cryptoWallets,
    withdrawTemplates,
    minDepositUsd,
    minWithdraw,
    supportLink,
    loading,
    error,
    refreshUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
