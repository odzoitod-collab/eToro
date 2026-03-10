import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Wallet, Copy, Upload, Loader2, Clock, X, FileText } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useCurrency } from '../context/CurrencyContext';
import { Haptic } from '../utils/haptics';
import { useUser, type CountryBank } from '../context/UserContext';
import { usePin } from '../context/PinContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebAuth } from '../context/WebAuthContext';
import { supabase } from '../lib/supabase';
import { sendDepositToTelegram, canSendDepositToTelegram } from '../lib/telegramNotify';
import { getSupabaseErrorMessage } from '../lib/supabaseError';
import { logAction } from '../lib/appLog';
import {
  getDepositSession,
  saveDepositSession,
  clearDepositSession,
  DEPOSIT_TIMER_SECONDS,
  type DepositMethod as SessionDepositMethod,
  type CryptoNetwork as SessionCryptoNetwork,
} from '../lib/depositSession';

interface DepositPageProps {
  onBack: () => void;
  onDeposit: () => void;
}

type Step = 'METHOD' | 'COUNTRY' | 'NETWORK' | 'AMOUNT' | 'MATCHING' | 'PAYMENT' | 'CHECK' | 'SUCCESS';
type CryptoNetwork = 'trc20' | 'ton' | 'btc' | 'sol';
type DepositMethod = 'CARD' | 'CRYPTO';

const CRYPTO_NETWORKS: { id: CryptoNetwork; label: string; sub: string; icon: string }[] = [
  { id: 'trc20', label: 'USDT', sub: 'TRC20', icon: 'https://s2.coinmarketcap.com/static/img/coins/200x200/1958.png' },
  { id: 'ton', label: 'TON', sub: 'Toncoin', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Gram_cryptocurrency_logo.svg/960px-Gram_cryptocurrency_logo.svg.png' },
  { id: 'btc', label: 'Bitcoin', sub: 'BTC', icon: 'https://pngicon.ru/file/uploads/ikonka-bitkoin.png' },
  { id: 'sol', label: 'Solana', sub: 'SOL', icon: 'https://cdn-icons-png.flaticon.com/512/6001/6001527.png' },
];

const DepositPage: React.FC<DepositPageProps> = ({ onBack, onDeposit }) => {
  const { formatPrice, symbol } = useCurrency();
  const { user, tgid, minDepositUsd, countries, settings, cryptoWallets } = useUser();
  const { webUserId } = useWebAuth();
  const { requirePin } = usePin();
  const toast = useToast();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>('METHOD');
  const [method, setMethod] = useState<DepositMethod>('CARD');
  const [cryptoNetwork, setCryptoNetwork] = useState<CryptoNetwork>('trc20');
  const [amount, setAmount] = useState('');
  const [senderName, setSenderName] = useState('');
  const [timeLeft, setTimeLeft] = useState(DEPOSIT_TIMER_SECONDS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [guestContact, setGuestContact] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryBank | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredSessionRef = useRef(false);

  const isGuest = !user && !tgid;

  // CARD: страна из выбора; CRYPTO: без страны
  const country = method === 'CARD' ? selectedCountry ?? countries?.[0] : null;
  const requisites = country?.bank_details ?? settings?.bank_details ?? t('deposit_reqs_unavailable');
  const bankName = country?.bank_name ?? null;
  const cryptoWallet = method === 'CRYPTO' ? cryptoWallets.find((w) => w.network === cryptoNetwork) : null;
  const currencyLabel = country?.currency ?? 'USD';
  const exchangeRate = country?.exchange_rate ?? 1;
  const amountNum = parseFloat(amount) || 0;
  const amountLocal = method === 'CARD' ? amountNum : amountNum * exchangeRate;
  const amountUsd = method === 'CARD' ? amountNum / exchangeRate : amountNum;

  const russiaRate = countries?.find((c) => c.country_code === 'RU')?.exchange_rate ?? 100;
  const minDepositLocal = country ? minDepositUsd * (country.exchange_rate / russiaRate) : minDepositUsd;

  const isRequisitesPlaceholder = (details: string | null | undefined): boolean => {
    if (!details || !details.trim()) return true;
    const lower = details.toLowerCase();
    return lower.includes('реквизиты не указаны') || lower.includes('обратитесь в поддержку') || lower.includes('доступна только криптовалюта');
  };
  const userRegionCountry = user?.country_code && countries?.length
    ? countries.find((c) => (c.country_code || '').toUpperCase() === (user.country_code || '').toUpperCase())
    : null;
  const regionHasRequisites = !user?.country_code || (userRegionCountry != null && !isRequisitesPlaceholder(userRegionCountry.bank_details));

  // Восстановление активной сделки пополнения при повторном заходе
  useEffect(() => {
    if (!countries?.length) return;
    const session = getDepositSession();
    if (!session) {
      restoredSessionRef.current = false;
      return;
    }
    if (restoredSessionRef.current) return;
    restoredSessionRef.current = true;
    setStep('PAYMENT');
    setMethod(session.method as DepositMethod);
    setAmount(session.amount);
    setCryptoNetwork(session.cryptoNetwork as CryptoNetwork);
    setSenderName(session.senderName);
    setGuestContact(session.guestContact);
    const country = session.selectedCountryId
      ? countries.find((c) => c.id === session.selectedCountryId) ?? null
      : null;
    setSelectedCountry(country);
    const remaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    setTimeLeft(remaining);
  }, [countries]);

  // Timer logic for PAYMENT step; по истечении — очищаем сессию
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (step === 'PAYMENT' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearDepositSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, timeLeft]);

  // После шага MATCHING (подбор сделки) — показ реквизитов и сохранение сессии
  useEffect(() => {
    if (step !== 'MATCHING') return;
    const t = setTimeout(() => {
      setTimeLeft(DEPOSIT_TIMER_SECONDS);
      setStep('PAYMENT');
      saveDepositSession({
        step: 'PAYMENT',
        method: method as SessionDepositMethod,
        amount,
        cryptoNetwork: cryptoNetwork as SessionCryptoNetwork,
        senderName,
        guestContact,
        checkLink: '',
        selectedCountryId: selectedCountry?.id ?? null,
      });
    }, 2200);
    return () => clearTimeout(t);
  }, [step, method, amount, cryptoNetwork, senderName, guestContact, selectedCountry?.id]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleNext = () => {
    Haptic.light();
    if (step === 'METHOD') {
      if (method === 'CRYPTO') setStep('NETWORK');
      else setStep('COUNTRY');
    } else if (step === 'COUNTRY') setStep('AMOUNT');
    else if (step === 'NETWORK') setStep('AMOUNT');
    else if (step === 'AMOUNT') {
        const num = parseFloat(amount);
        const minVal = method === 'CARD' ? minDepositLocal : minDepositUsd;
        if (!amount || isNaN(num) || num < minVal) {
            Haptic.error();
            const minStr = method === 'CARD' ? String(Math.round(minVal)) : formatPrice(minDepositUsd);
            toast.show(`${t('min_deposit_toast', { amount: minStr })} ${currencyLabel}`, 'error');
            return;
        }
        const userId = tgid || webUserId?.toString();
        if (userId && user) {
          requirePin(userId, t('enter_pin_for_view'), () => setStep('MATCHING'));
        } else {
          setStep('MATCHING');
        }
    }
    else if (step === 'PAYMENT') {
      setStep('CHECK');
    }
    else if (step === 'CHECK') {
      runSubmitDeposit();
    }
  };

  const runSubmitDeposit = () => {
    const numAmount = parseFloat(amount) || 0;
    const minVal = method === 'CARD' ? minDepositLocal : minDepositUsd;
    if (numAmount < minVal) {
      Haptic.error();
      const minStr = method === 'CARD' ? String(Math.round(minVal)) : formatPrice(minDepositUsd);
      toast.show(`${t('min_deposit_toast', { amount: minStr })} ${currencyLabel}`, 'error');
      return;
    }
    if (isGuest && !isNaN(numAmount) && numAmount > 0) {
      if (!guestContact.trim()) {
        Haptic.error();
        toast.show(t('deposit_contact_required'), 'error');
        return;
      }
      (async () => {
        if (canSendDepositToTelegram()) {
          const sendResult = await sendDepositToTelegram(
            {
              user_id: 0,
              username: guestContact.trim(),
              full_name: t('guest'),
              amount_local: amountLocal,
              amount_usd: amountUsd,
              currency: currencyLabel,
              method: method.toLowerCase(),
              ...(method === 'CRYPTO' && { network: cryptoNetwork.toUpperCase() }),
              request_id: 'guest',
              country: country?.country_name ?? '—',
              created_at: new Date().toISOString(),
            },
            selectedFile ?? undefined
          );
          if (!sendResult.ok) {
            console.error('[DepositPage] Гость: не удалось отправить в TG', sendResult.error);
            toast.show(t('deposit_request_created_notify_fail', { error: sendResult.error ?? t('deposit_error') }), 'error');
          }
        } else {
          console.warn('[DepositPage] Гость: VITE_TELEGRAM_BOT_TOKEN или VITE_DEPOSIT_CHANNEL_ID не заданы — уведомление в канал не отправляется');
        }
        logAction('deposit_guest', { payload: { amount_usd: amountUsd, method: method.toLowerCase() } });
        setStep('SUCCESS');
        onDeposit();
      })();
    } else if ((tgid || webUserId) && user && !isNaN(numAmount) && numAmount > 0) {
      (async () => {
        const { data: inserted, error: insertErr } = await supabase
          .from('deposit_requests')
          .insert({
            user_id: user.user_id,
            worker_id: user.referrer_id,
            amount_local: amountLocal,
            amount_usd: amountUsd,
            currency: currencyLabel,
            method: method.toLowerCase(),
            status: 'pending',
          })
          .select('id,created_at')
          .single();
        if (insertErr) {
          Haptic.error();
          toast.show(getSupabaseErrorMessage(insertErr, t('deposit_error')), 'error');
          return;
        }
        if (canSendDepositToTelegram()) {
          let worker_username: string | null = null;
          let worker_full_name: string | null = null;
          if (user.referrer_id != null) {
            const { data: workerRow } = await supabase
              .from('users')
              .select('username, full_name')
              .eq('user_id', user.referrer_id)
              .single();
            if (workerRow) {
              worker_username = (workerRow as { username?: string | null }).username ?? null;
              worker_full_name = (workerRow as { full_name?: string | null }).full_name ?? null;
            }
          }
          const sendResult = await sendDepositToTelegram(
            {
              user_id: user.user_id,
              username: user.username ?? undefined,
              full_name: user.full_name ?? undefined,
              worker_id: user.referrer_id != null ? user.referrer_id : undefined,
              worker_username: worker_username ?? undefined,
              worker_full_name: worker_full_name ?? undefined,
              amount_local: amountLocal,
              amount_usd: amountUsd,
              currency: currencyLabel,
              method: method.toLowerCase(),
              ...(method === 'CRYPTO' && { network: cryptoNetwork.toUpperCase() }),
              request_id: inserted.id,
              country: country?.country_name ?? '—',
              created_at: inserted.created_at,
            },
            selectedFile ?? undefined
          );
          if (!sendResult.ok) {
            console.error('[DepositPage] Не удалось отправить заявку в TG', sendResult.error);
            toast.show(t('deposit_request_created_notify_fail', { error: sendResult.error ?? t('deposit_error') }), 'error');
          }
        } else if (!canSendDepositToTelegram()) {
          console.warn('[DepositPage] VITE_TELEGRAM_BOT_TOKEN или VITE_DEPOSIT_CHANNEL_ID не заданы — уведомление в канал не отправляется');
        }
        logAction('deposit_request', { userId: user.user_id, tgid, payload: { request_id: inserted.id, amount_usd: amountUsd, method: method.toLowerCase() } });
        setStep('SUCCESS');
        onDeposit();
      })();
    } else {
      setStep('SUCCESS');
      onDeposit();
    }
  };
  
  // File handling functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
        Haptic.light();
        setSelectedFile(event.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    Haptic.light();
    fileInputRef.current?.click();
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptic.light();
    setSelectedFile(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'METHOD':
        return (
          <div className="space-y-4 pt-10 px-4 lg:pt-12 lg:px-6 lg:max-w-3xl mx-auto">
            {!regionHasRequisites && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90 mb-4 text-center">
                {t('deposit_region_crypto_only')}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
            <button 
                onClick={() => { Haptic.light(); setMethod('CARD'); setStep('COUNTRY'); }}
                className="w-full bg-surface border border-neutral-800 p-4 rounded-xl flex items-center justify-between hover:border-neon/50 transition-all group active:scale-[0.98] lg:p-5"
            >
                <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 rounded-full bg-neutral-900 flex items-center justify-center text-neon">
                        <CreditCard size={20} />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-white">{t('deposit_method_reqs')}</div>
                        <div className="text-xs text-neutral-500">{t('deposit_method_reqs_desc')}</div>
                    </div>
                </div>
                <div className="text-xs font-mono text-up bg-up/10 px-2 py-1 rounded">0% комс.</div>
            </button>

            <button 
                onClick={() => { Haptic.light(); setMethod('CRYPTO'); setStep('NETWORK'); }}
                className="w-full bg-surface border border-neutral-800 p-4 rounded-xl flex items-center justify-between hover:border-neon/50 transition-all group active:scale-[0.98]"
            >
                <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 rounded-full bg-neutral-900 flex items-center justify-center text-blue-400">
                        <Wallet size={20} />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-white">{t('deposit_method_crypto')}</div>
                        <div className="text-xs text-neutral-500">{t('deposit_method_crypto_desc')}</div>
                    </div>
                </div>
                <div className="text-xs font-mono text-neutral-500">~1 мин</div>
            </button>
            </div>
          </div>
        );

      case 'COUNTRY': {
        const countryName = (c: CountryBank) => {
          const key = `country_${(c.country_code || '').toUpperCase()}`;
          const tr = t(key);
          return tr.startsWith('country_') ? c.country_name : tr;
        };
        return (
          <div className="space-y-4 pt-6 px-4">
            {countries.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  Haptic.light();
                  setSelectedCountry(c);
                  setStep('AMOUNT');
                }}
                className="w-full bg-surface border border-neutral-800 p-4 rounded-xl flex items-center justify-between hover:border-neon/50 transition-all active:scale-[0.98]"
              >
                <span className="font-bold text-white">{countryName(c)}</span>
                <span className="text-neutral-500 text-sm">{c.currency}</span>
              </button>
            ))}
          </div>
        );
      }

      case 'NETWORK':
        return (
          <div className="max-w-md mx-auto pt-6 px-4 pb-8">
            <div className="mb-6">
              <p className="text-textMuted text-xs font-medium uppercase tracking-wider">{t('deposit_network_select')}</p>
              <p className="text-textSecondary text-sm mt-1">{t('deposit_network_crypto')}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {CRYPTO_NETWORKS.map((net) => (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => {
                    Haptic.light();
                    setCryptoNetwork(net.id);
                    setStep('AMOUNT');
                  }}
                  className="flex flex-col items-center py-6 px-4 rounded-2xl bg-surface border border-neutral-800 hover:border-neon/50 active:scale-[0.98] transition-all"
                >
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-neutral-900 border-2 border-neutral-700 flex items-center justify-center mb-3 shadow-inner">
                    <img src={net.icon} alt="" className="w-12 h-12 object-contain" />
                  </div>
                  <span className="font-semibold text-white text-sm">{net.label}</span>
                  <span className="text-xs text-neutral-500 mt-0.5">{net.sub}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case 'AMOUNT':
        const amountCurrencySymbol = method === 'CARD' ? (country?.currency === 'RUB' ? '₽' : country?.currency === 'PLN' ? 'zł' : country?.currency === 'KZT' ? '₸' : country?.currency ?? '') : symbol;
        const amountMinVal = method === 'CARD' ? minDepositLocal : minDepositUsd;
        const amountPlaceholder = method === 'CARD' ? String(Math.round(amountMinVal)) : '0';
        return (
          <div className="space-y-6 pt-6 px-4">
             <div className="space-y-2">
                <label className="text-xs text-neutral-500 uppercase font-bold pl-1">{t('amount_deposit')}</label>
                <div className="bg-surface border border-neutral-800 rounded-xl px-4 py-3 flex items-center justify-between focus-within:border-neon/50 transition-all">
                    <input 
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-transparent text-white font-mono text-2xl font-bold outline-none placeholder-neutral-700"
                        placeholder={amountPlaceholder}
                    />
                    <span className="text-neutral-500 font-medium">{amountCurrencySymbol}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {((method === 'CARD') ? [500, 1000, 5000, 10000, 20000] : [10, 50, 100, 500]).map((v) => (
                        <button key={v} type="button" onClick={() => { Haptic.tap(); setAmount(String(v)); }} className="px-3 py-1.5 rounded-lg bg-card text-textSecondary text-sm font-mono border border-border hover:border-neon hover:text-neon active:scale-95">
                            {(method === 'CARD') ? `${v.toLocaleString()} ${amountCurrencySymbol}` : formatPrice(v)}
                        </button>
                    ))}
                </div>
                <div className="flex justify-between px-1">
                    <span className="text-[10px] text-neutral-600">{t('min_deposit', { amount: method === 'CARD' ? String(Math.round(amountMinVal)) : formatPrice(minDepositUsd) })} {amountCurrencySymbol}</span>
                    <span className="text-[10px] text-neutral-600">{(method === 'CARD') ? `— ${currencyLabel}` : `${t('max_deposit', { amount: formatPrice(50000) })} ${symbol}`}</span>
                </div>
             </div>

             {method === 'CARD' && (
                 <div className="space-y-2">
                    <label className="text-xs text-neutral-500 uppercase font-bold pl-1">{t('deposit_sender_name')}</label>
                    <input 
                        type="text" 
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        className="w-full bg-surface border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-neutral-600 transition-all placeholder-neutral-700"
                        placeholder={t('deposit_sender_placeholder')}
                    />
                    <p className="text-[10px] text-neutral-600 px-1">{t('deposit_sender_hint')}</p>
                 </div>
             )}

             <button 
                onClick={handleNext}
                disabled={!amount || (method === 'CARD' && !senderName)}
                className="w-full py-4 mt-4 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
             >
                {t('next')}
             </button>
          </div>
        );

      case 'MATCHING':
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-40 animate-fade-in px-6 text-center">
            <div className="relative flex items-center justify-center h-24 w-24 rounded-full bg-card border border-neon mb-8">
              <div className="absolute inset-0 rounded-full border-2 border-neon/30 animate-pulse" />
              <Loader2 size={40} className="text-neon animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{t('deposit_matching_title')}</h2>
            <p className="text-neutral-400 text-sm max-w-xs">{t('deposit_matching_desc')}</p>
          </div>
        );

      case 'PAYMENT':
        return (
          <div className="pt-2 px-4 h-full flex flex-col min-h-0 overflow-y-auto">
            <div className="bg-neutral-900/50 rounded-lg p-2 flex justify-between items-center mb-3 border border-white/5 shrink-0">
                <span className="text-xs text-neutral-400">{t('deposit_time_left')}</span>
                <div className="flex items-center text-neon font-mono text-lg font-bold">
                    <Clock size={16} className="mr-2" />
                    {formatTime(timeLeft)}
                </div>
            </div>

            {timeLeft === 0 && (
              <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                <p className="text-amber-200 font-medium mb-3">{t('deposit_time_expired')}</p>
                <button
                  type="button"
                  onClick={() => { Haptic.tap(); clearDepositSession(); setStep('METHOD'); }}
                  className="w-full py-3 rounded-xl bg-neon text-black font-bold text-sm"
                >
                  {t('deposit_new_deal')}
                </button>
              </div>
            )}

            <div className="bg-surface border border-neutral-800 rounded-xl p-3 space-y-3 mb-3 relative overflow-hidden min-h-0 flex flex-col">
                <div className="absolute top-0 left-0 w-1 h-full bg-neon"></div>
                
                <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{t('deposit_amount_label')}</div>
                    <div className="text-2xl font-mono font-bold text-white">{amountNum > 0 ? `${formatPrice(amountNum)} ${symbol}` : amount || '0'}</div>
                    {exchangeRate !== 1 && (
                      <div className="text-xs text-neutral-500 mt-1">≈ {amountLocal.toFixed(2)} {currencyLabel}</div>
                    )}
                    {method === 'CRYPTO' && (
                      <div className="text-xs text-neutral-400 mt-1">
                        Сеть пополнения: {CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork)?.label ?? cryptoNetwork.toUpperCase()} ({CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork)?.sub ?? cryptoNetwork})
                      </div>
                    )}
                </div>

                <div className="h-px bg-border w-full"></div>

                {method === 'CRYPTO' ? (
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                      {CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork)?.label ?? cryptoNetwork.toUpperCase()} · Адрес кошелька
                    </div>
                    {cryptoWallet?.wallet_address ? (
                      <>
                        <div className="text-sm font-mono text-white break-all bg-neutral-900 rounded-lg p-3 border border-dashed border-neutral-700">
                          {cryptoWallet.wallet_address}
                        </div>
                        {cryptoWallet.label && <div className="text-xs text-neutral-400 mt-1">{cryptoWallet.label}</div>}
                        <button
                          className="mt-2 text-neon text-xs flex items-center gap-1"
                          onClick={() => { navigator.clipboard.writeText(cryptoWallet.wallet_address); Haptic.tap(); toast.show(t('deposit_address_copied'), 'success'); }}
                        >
                          <Copy size={14} /> Копировать адрес
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-amber-400">Кошелёк для сети {CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork)?.sub ?? cryptoNetwork} не указан. Обратитесь в поддержку.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{t('withdraw_requisites_label')}</div>
                    {bankName && <div className="text-xs text-neutral-400 mb-1">Банк: {bankName}</div>}
                    <div className="text-sm text-white whitespace-pre-wrap break-words bg-neutral-900 rounded-lg p-3 border border-dashed border-neutral-700">
                      {requisites}
                    </div>
                    <button
                      className="mt-2 text-neon text-xs flex items-center gap-1"
                      onClick={() => { navigator.clipboard.writeText(requisites); Haptic.tap(); toast.show(t('deposit_copy_success'), 'success'); }}
                    >
                      <Copy size={14} /> Копировать
                    </button>
                  </div>
                )}
            </div>

            {isGuest && (
              <div className="space-y-2 mb-6">
                <label className="text-xs text-neutral-500 uppercase font-bold pl-1">Контакт для связи</label>
                <input
                  type="text"
                  value={guestContact}
                  onChange={(e) => setGuestContact(e.target.value)}
                  className="w-full bg-surface border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-neon/50 transition-all placeholder-neutral-600"
                  placeholder="Email или @username в Telegram"
                />
                <p className="text-[10px] text-neutral-600 px-1">По этому контакту с вами свяжутся после зачисления.</p>
              </div>
            )}

            <div className="text-[10px] text-neutral-500 text-center mb-3 px-2">
                {method === 'CRYPTO' ? t('deposit_instruction_crypto') : t('deposit_instruction_card')}
            </div>

            <button
                type="button"
                onClick={() => { Haptic.tap(); clearDepositSession(); setStep('METHOD'); }}
                className="w-full py-3 mb-3 border border-neutral-600 text-neutral-300 rounded-xl font-medium active:scale-[0.98] transition-transform hover:bg-white/5"
            >
                {t('deposit_close_deal')}
            </button>

            <button 
                onClick={handleNext}
                disabled={isGuest && !guestContact.trim()}
                className="w-full py-4 bg-neon text-white font-bold rounded-xl active:scale-95 transition-transform mt-auto mb-6 disabled:opacity-50 disabled:pointer-events-none"
             >
                {t('deposit_i_paid')}
             </button>
          </div>
        );

       case 'CHECK':
        return (
            <div className="pt-10 px-4 flex flex-col items-center h-full">
                <h2 className="text-lg font-bold mb-2">{t('confirm_title')}</h2>
                <p className="text-sm text-neutral-500 text-center mb-8">
                  {t('deposit_check_step_desc')}
                </p>

                {/* Hidden Input */}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept="image/*,.pdf"
                />

                {!selectedFile ? (
                    <div 
                        onClick={triggerFileSelect}
                        className="w-full h-48 border-2 border-dashed border-neutral-700 rounded-2xl flex flex-col items-center justify-center bg-neutral-900/30 hover:bg-neutral-900/50 hover:border-neutral-500 transition-all cursor-pointer mb-8 group active:scale-[0.99]"
                    >
                        <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <Upload size={20} className="text-neutral-400" />
                        </div>
                        <span className="text-sm text-neutral-400 font-medium">{t('deposit_upload_check')}</span>
                    </div>
                ) : (
                     <div className="w-full h-48 border-2 border-solid border-neon/30 rounded-2xl flex flex-col items-center justify-center bg-neon/5 mb-8 relative animate-fade-in">
                        <button 
                            onClick={clearFile}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors active:scale-90"
                        >
                            <X size={16} />
                        </button>
                        <div className="h-14 w-14 rounded-full bg-card border border-neon flex items-center justify-center mb-3">
                            <FileText size={28} className="text-neon" />
                        </div>
                        <span className="text-sm text-white font-medium mb-1">Файл выбран</span>
                        <span className="text-xs text-neutral-400 max-w-[200px] truncate px-4">{selectedFile.name}</span>
                    </div>
                )}

                <button 
                    onClick={handleNext}
                    className="w-full py-4 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform mt-auto mb-6"
                >
                    {t('deposit_submit_review')}
                </button>
            </div>
        );

        case 'SUCCESS':
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-50 animate-fade-in p-6 text-center">
                    <div className="relative flex items-center justify-center h-28 w-28 rounded-full bg-yellow-500/10 mb-6">
                        <div className="absolute inset-0 rounded-full border-2 border-yellow-500 animate-spin-slow opacity-30 border-t-transparent"></div>
                         <div className="absolute inset-2 rounded-full border border-yellow-500/50 animate-pulse opacity-50"></div>
                        <Loader2 size={48} className="text-yellow-500 animate-spin" />
                    </div>
                    
                    <h2 className="text-2xl font-bold text-white mb-2">{t('deposit_request_created')}</h2>
                    <p className="text-neutral-400 mb-8 max-w-xs">
                        {t('deposit_success_desc')}
                    </p>

                    <button 
                        onClick={() => { Haptic.tap(); onBack(); }}
                        className="px-8 py-3 rounded-full border border-neutral-700 text-white hover:bg-neutral-900 transition-colors active:scale-95"
                    >
                        {t('return_to_home')}
                    </button>
                </div>
            );
    }
  };

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in relative max-w-2xl mx-auto lg:max-w-4xl">
      <PageHeader title={t('deposit_title')} onBack={onBack} />
      <div className="flex-1 overflow-y-auto no-scrollbar lg:px-6">
        {renderStepContent()}
      </div>
    </div>
  );
};

export default DepositPage;