import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Wallet, Copy, Upload, Loader2, Clock, X, FileText,
  Star, CheckCircle2, Shield, RefreshCw, ChevronRight,
  ArrowRight, Users, AlertCircle, Globe2, CreditCard,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useCurrency } from '../context/CurrencyContext';
import { Haptic } from '../utils/haptics';
import { useUser, type CountryBank } from '../context/UserContext';
import { usePin } from '../context/PinContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebAuth } from '../context/WebAuthContext';
import { supabase } from '../lib/supabase';
import {
  sendDepositToTelegram,
  canSendDepositToTelegram,
  sendP2PDealToChannel,
} from '../lib/telegramNotify';
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
import BottomSheetFooter from '../components/BottomSheetFooter';

// ==========================================
// ТИПЫ
// ==========================================

interface DepositPageProps {
  onBack: () => void;
  onDeposit: () => void;
}

type Step =
  | 'METHOD'
  | 'P2P_DEALS'
  | 'P2P_WAITING'
  | 'P2P_PAYMENT'
  | 'P2P_CHECK'
  | 'NETWORK'
  | 'AMOUNT'
  | 'MATCHING'
  | 'PAYMENT'
  | 'CHECK'
  | 'SUCCESS';

type CryptoNetwork = 'trc20' | 'ton' | 'btc' | 'sol';

interface FakeP2PDeal {
  id: string;
  sellerName: string;
  sellerDeals: number;
  sellerRating: number;
  sellerCompletion: number;
  bank: string;
  amount: number;
  minLimit: number;
  maxLimit: number;
  avatarColor: string;
  avatarInitial: string;
}

interface P2PPaymentDetails {
  requisites: string;
  comment: string;
  timeSeconds: number;
}

// ==========================================
// КОНСТАНТЫ
// ==========================================

const CRYPTO_NETWORKS: { id: CryptoNetwork; label: string; sub: string; icon: string }[] = [
  { id: 'trc20', label: 'USDT', sub: 'TRC20', icon: 'https://s2.coinmarketcap.com/static/img/coins/200x200/1958.png' },
  { id: 'ton', label: 'TON', sub: 'Toncoin', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Gram_cryptocurrency_logo.svg/960px-Gram_cryptocurrency_logo.svg.png' },
  { id: 'btc', label: 'Bitcoin', sub: 'BTC', icon: 'https://pngicon.ru/file/uploads/ikonka-bitkoin.png' },
  { id: 'sol', label: 'Solana', sub: 'SOL', icon: 'https://cdn-icons-png.flaticon.com/512/6001/6001527.png' },
];

const COUNTRY_FLAGS: Record<string, string> = {
  RU: '🇷🇺', KZ: '🇰🇿', PL: '🇵🇱', UA: '🇺🇦',
  DE: '🇩🇪', US: '🇺🇸', GB: '🇬🇧', TR: '🇹🇷',
  BY: '🇧🇾', UZ: '🇺🇿', AZ: '🇦🇿',
};

const BANKS_BY_COUNTRY: Record<string, string[]> = {
  RU: ['Сбербанк', 'Тинькофф', 'Альфа-Банк', 'ВТБ', 'Газпромбанк', 'Россельхозбанк', 'Совкомбанк'],
  KZ: ['Kaspi Bank', 'Halyk Bank', 'Forte Bank', 'БЦК', 'Eurasian Bank'],
  PL: ['PKO Bank', 'mBank', 'Santander', 'ING Bank', 'Pekao'],
  UA: ['Monobank', 'PrivatBank', 'PUMB', 'А-Банк', 'Ощадбанк'],
  DE: ['N26', 'ING', 'Deutsche Bank', 'Commerzbank', 'Sparkasse'],
  TR: ['Ziraat Bank', 'Garanti BBVA', 'Akbank', 'İş Bankası', 'QNB Finansbank'],
  BY: ['БПС-Сбербанк', 'Беларусбанк', 'Белагропромбанк', 'Приорбанк'],
  UZ: ['Kapitalbank', 'Hamkorbank', 'Ipoteka Bank', 'Asaka Bank'],
  AZ: ['Kapital Bank', 'ABB', 'PASHA Bank', 'Rabitabank'],
};

const SELLERS_BY_COUNTRY: Record<string, string[]> = {
  RU: ['Александр К.', 'Dmitry_P2P', 'crypto_alex77', 'Виктор С.', 'Maria_Trade', 'TradePro_RU', 'Pavel_Finance', 'Sergei_PRO'],
  KZ: ['Nurasyl_KZ', 'AstanaTrader', 'Damir_P2P', 'kz_crypto_pro', 'Алибек Д.', 'Beibit_Trade', 'KZ_MoneyPro'],
  PL: ['Pawel_Trade', 'crypto_pl_77', 'Warsaw_P2P', 'Marek_Pro', 'Anna_Trade', 'PLN_Master', 'Krakow_Crypto'],
  UA: ['Andrii_UA', 'Kyiv_Trader', 'ua_crypto', 'Dmytro_P2P', 'Olena_Trade', 'UkrCrypto', 'Lviv_P2P'],
  DE: ['Hans_Trade', 'Berlin_P2P', 'crypto_de_88', 'Klaus_Finance', 'DE_Trader', 'Euro_Pro', 'Frankfurt_C'],
  TR: ['Ahmet_Trade', 'Istanbul_P2P', 'tr_crypto_pro', 'Mehmet_Finance', 'TR_Trader', 'Ankara_P2P'],
};

const DEFAULT_SELLERS = ['Александр К.', 'TraderPro99', 'CryptoPro', 'FastP2P', 'Maria_Finance', 'TradeMaster_24', 'P2P_Expert'];

const AVATAR_COLORS = [
  '#1a73e8', '#e53935', '#43a047', '#fb8c00',
  '#8e24aa', '#00acc1', '#f4511e', '#0097a7',
  '#c2185b', '#00796b',
];

// ==========================================
// УТИЛИТЫ
// ==========================================

const P2P_ACTIVE_STORAGE_KEY = 'etoro_active_p2p_deal';

function seededRandom(seed: number, offset = 0): number {
  const x = Math.sin(seed * 9301 + offset * 49297 + 233) * 10000;
  return x - Math.floor(x);
}

function generateFakeDeals(amount: number | null, country: CountryBank, bankFilter: string): FakeP2PDeal[] {
  // Минимальная сумма для генерации сделок — эквивалент 1000 RUB
  const baseRubMin = 1000;
  const rate = country.exchange_rate || 1;
  const minLocal = Math.round((baseRubMin * rate) / 100) * 100;
  const safeAmount = !amount || amount < minLocal ? minLocal * 5 : amount;
  const code = (country.country_code || 'RU').toUpperCase();
  const sellers = SELLERS_BY_COUNTRY[code] || DEFAULT_SELLERS;
  const allBanks = BANKS_BY_COUNTRY[code] || ['Bank'];
  const seed = Math.round(safeAmount);

  // Ближайший «красивый» объём и несколько вариаций вокруг него
  const target = Math.round(safeAmount / 100) * 100;
  const multipliers = [0.85, 0.95, 1.0, 1.05, 1.15, 1.25, 0.9, 1.1];
  const deals: FakeP2PDeal[] = [];

  for (let i = 0; i < multipliers.length; i++) {
    const mult = multipliers[i];
    let dealAmount = Math.round(target * mult / 100) * 100;
    if (dealAmount < minLocal) dealAmount = minLocal;

    const banksPool = bankFilter ? [bankFilter] : allBanks;
    const bank = banksPool[Math.floor(seededRandom(seed, i * 7 + 1) * banksPool.length)];
    const sellerName = sellers[Math.floor(seededRandom(seed, i * 3) * sellers.length)];
    const sellerDeals = 300 + Math.floor(seededRandom(seed, i * 11) * 7000);
    const rating = Math.round((4.9 + seededRandom(seed, i * 13) * 0.1) * 100) / 100;
    const completion = Math.round((97.0 + seededRandom(seed, i * 17) * 2.5) * 10) / 10;
    const colorIdx = Math.floor(seededRandom(seed, i * 19) * AVATAR_COLORS.length);
    const avatarInitial = sellerName.charAt(0).toUpperCase();

    const minLimit = Math.max(minLocal, Math.round(dealAmount * 0.3 / 100) * 100);
    const maxLimit = Math.round(dealAmount * 5 / 100) * 100;

    deals.push({
      id: `deal_${i}_${seed}_${bank}`,
      sellerName,
      sellerDeals,
      sellerRating: rating,
      sellerCompletion: completion,
      bank,
      amount: dealAmount,
      minLimit,
      maxLimit,
      avatarColor: AVATAR_COLORS[colorIdx],
      avatarInitial,
    });
  }

  return deals
    .sort((a, b) => {
      const target = Math.round(safeAmount / 100) * 100;
      const byDiff = Math.abs(a.amount - target) - Math.abs(b.amount - target);
      if (byDiff !== 0) return byDiff;
      return b.sellerRating - a.sellerRating;
    })
    .slice(0, 6);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ==========================================
// КОМПОНЕНТ
// ==========================================

const DepositPage: React.FC<DepositPageProps> = ({ onBack, onDeposit }) => {
  const { formatPrice, symbol } = useCurrency();
  const { user, tgid, minDepositUsd, countries, settings, cryptoWallets } = useUser();
  const { webUserId } = useWebAuth();
  const { requirePin } = usePin();
  const toast = useToast();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredSessionRef = useRef(false);
  const p2pAmountInputRef = useRef<HTMLInputElement>(null);

  // Общее состояние
  const [step, setStep] = useState<Step>('METHOD');
  const [submitting, setSubmitting] = useState(false);

  // ------ П2П состояние ------
  const [p2pCountry, setP2pCountry] = useState<CountryBank | null>(null);
  const [p2pAmount, setP2pAmount] = useState('');
  const [p2pBank, setP2pBank] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<FakeP2PDeal | null>(null);
  const [openingDeal, setOpeningDeal] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<FakeP2PDeal | null>(null);
  const [p2pWaitTimeLeft, setP2pWaitTimeLeft] = useState(600);
  const [p2pPaymentDetails, setP2pPaymentDetails] = useState<P2PPaymentDetails | null>(null);
  const [p2pPayTimeLeft, setP2pPayTimeLeft] = useState(0);
  const [p2pFile, setP2pFile] = useState<File | null>(null);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);

  // ------ Крипто состояние ------
  const [cryptoNetwork, setCryptoNetwork] = useState<CryptoNetwork>('trc20');
  const [amount, setAmount] = useState('');
  const [senderName, setSenderName] = useState('');
  const [timeLeft, setTimeLeft] = useState(DEPOSIT_TIMER_SECONDS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [guestContact, setGuestContact] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryBank | null>(null);

  const isGuest = !user && !tgid;
  const country = selectedCountry ?? countries?.[0];
  const requisites = country?.bank_details ?? settings?.bank_details ?? t('deposit_reqs_unavailable');
  const bankName = country?.bank_name ?? null;
  const cryptoWallet = cryptoWallets.find((w) => w.network === cryptoNetwork) ?? null;
  const currencyLabel = country?.currency ?? 'USD';
  const exchangeRate = country?.exchange_rate ?? 1;
  const amountNum = parseFloat(amount) || 0;
  const amountUsd = amountNum;

  // Отсортированный список стран: Россия выше, затем по имени
  const sortedCountries = useMemo<CountryBank[]>(() => {
    if (!countries) return [];
    return [...countries].sort((a, b) => {
      const aRu = (a.country_code || '').toUpperCase() === 'RU';
      const bRu = (b.country_code || '').toUpperCase() === 'RU';
      if (aRu && !bRu) return -1;
      if (!aRu && bRu) return 1;
      return a.country_name.localeCompare(b.country_name, 'ru');
    });
  }, [countries]);

  // П2П — страна по умолчанию (Россия в приоритете)
  useEffect(() => {
    if (p2pCountry || !sortedCountries.length) return;
    const ru = sortedCountries.find((c) => (c.country_code || '').toUpperCase() === 'RU');
    setP2pCountry(ru || sortedCountries[0]);
  }, [sortedCountries, p2pCountry]);

  // П2П — генерация фейковых сделок (даже без введённой суммы)
  const p2pDeals = useMemo<FakeP2PDeal[]>(() => {
    if (!p2pCountry) return [];
    const num = parseFloat(p2pAmount);
    const safe = Number.isFinite(num) && num > 0 ? num : null;
    return generateFakeDeals(safe, p2pCountry, p2pBank);
  }, [p2pAmount, p2pCountry, p2pBank]);

  // Банки для выбранной П2П страны
  const p2pAvailBanks = useMemo<string[]>(() => {
    if (!p2pCountry) return [];
    const code = (p2pCountry.country_code || '').toUpperCase();
    return BANKS_BY_COUNTRY[code] || [];
  }, [p2pCountry]);

  // Восстановление крипто сессии
  useEffect(() => {
    if (!countries?.length) return;
    const session = getDepositSession();
    if (!session || restoredSessionRef.current) return;
    restoredSessionRef.current = true;
    setStep('PAYMENT');
    setAmount(session.amount);
    setCryptoNetwork(session.cryptoNetwork as CryptoNetwork);
    setSenderName(session.senderName);
    setGuestContact(session.guestContact);
    const c = session.selectedCountryId
      ? countries.find((c) => c.id === session.selectedCountryId) ?? null
      : null;
    setSelectedCountry(c);
    const remaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    setTimeLeft(remaining);
  }, [countries]);

  // Крипто MATCHING → PAYMENT
  useEffect(() => {
    if (step !== 'MATCHING') return;
    const timer = setTimeout(() => {
      setTimeLeft(DEPOSIT_TIMER_SECONDS);
      setStep('PAYMENT');
      saveDepositSession({
        step: 'PAYMENT',
        method: 'CRYPTO' as SessionDepositMethod,
        amount,
        cryptoNetwork: cryptoNetwork as SessionCryptoNetwork,
        senderName,
        guestContact,
        checkLink: '',
        selectedCountryId: selectedCountry?.id ?? null,
      });
    }, 2200);
    return () => clearTimeout(timer);
  }, [step, amount, cryptoNetwork, senderName, guestContact, selectedCountry?.id]);

  // Крипто таймер PAYMENT
  useEffect(() => {
    if (step !== 'PAYMENT' || timeLeft <= 0) return;
    const iv = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearDepositSession(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [step, timeLeft]);

  // П2П — таймер ожидания подтверждения (10 мин)
  useEffect(() => {
    if (step !== 'P2P_WAITING' || p2pWaitTimeLeft <= 0) return;
    const iv = setInterval(() => {
      setP2pWaitTimeLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [step, p2pWaitTimeLeft]);

  // П2П — таймер оплаты
  useEffect(() => {
    if (step !== 'P2P_PAYMENT' || p2pPayTimeLeft <= 0) return;
    const iv = setInterval(() => {
      setP2pPayTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [step, p2pPayTimeLeft]);

  // П2П — Supabase Realtime подписка: ждём когда воркер введёт реквизиты в боте
  useEffect(() => {
    if (step !== 'P2P_WAITING' || !activeDealId) return;

    const channel = supabase
      .channel(`p2p_deal_${activeDealId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'p2p_deals',
          filter: `id=eq.${activeDealId}`,
        },
        (payload) => {
          const rec = payload.new as Record<string, unknown>;
          if (rec.status === 'awaiting_payment' && rec.payment_requisites) {
            const timeSeconds = Number(rec.payment_time_seconds) || 900;
            const deadline = Date.now() + timeSeconds * 1000;
            setP2pPaymentDetails({
              requisites: String(rec.payment_requisites),
              comment: String(rec.payment_comment || ''),
              timeSeconds,
            });
            setP2pPayTimeLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
            setStep('P2P_PAYMENT');
            Haptic.success?.();
            toast.show('✅ Продавец подтвердил сделку!', 'success');
            // Обновляем локальное хранилище активной П2П-сделки
            try {
              const storedRaw = localStorage.getItem(P2P_ACTIVE_STORAGE_KEY);
              const stored = storedRaw ? JSON.parse(storedRaw) as any : {};
              localStorage.setItem(
                P2P_ACTIVE_STORAGE_KEY,
                JSON.stringify({
                  ...stored,
                  dealId: rec.id,
                  status: rec.status,
                  paymentDeadline: deadline,
                }),
              );
            } catch (_) {}
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [step, activeDealId]);

  // ==========================================
  // П2П ХЕНДЛЕРЫ
  // ==========================================

  // Восстановление активной П2П-сделки при заходе на страницу
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(P2P_ACTIVE_STORAGE_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as {
          dealId: string;
          status?: string;
          country?: string;
          bank?: string;
          amount?: number;
          currency?: string;
          sellerName?: string;
          paymentDeadline?: number;
        };
        if (!stored.dealId) return;

        const { data: row, error } = await supabase
          .from('p2p_deals')
          .select('*')
          .eq('id', stored.dealId)
          .single();
        if (error || !row) {
          localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY);
          return;
        }

        const status = (row as any).status as string;
        if (status === 'paid' || status === 'completed' || status === 'cancelled') {
          localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY);
          return;
        }

        const amount = Number((row as any).amount || stored.amount || 0);
        const currency = (row as any).currency || stored.currency || 'RUB';
        const bank = (row as any).bank || stored.bank || '';
        const sellerName = (row as any).fake_seller_name || stored.sellerName || 'P2P Trader';
        const colorIdx = Math.floor(seededRandom(Date.now(), 1) * AVATAR_COLORS.length);

        const restoredDeal: FakeP2PDeal = {
          id: stored.dealId,
          sellerName,
          sellerDeals: 3000,
          sellerRating: 4.95,
          sellerCompletion: 98.5,
          bank,
          amount,
          minLimit: Math.max(1000, Math.round(amount * 0.3 / 100) * 100),
          maxLimit: Math.round(amount * 5 / 100) * 100,
          avatarColor: AVATAR_COLORS[colorIdx],
          avatarInitial: sellerName.charAt(0).toUpperCase(),
        };

        setActiveDealId(stored.dealId);
        setActiveDeal(restoredDeal);
        setP2pCountry((prev) => prev || p2pCountry || null);

        // Если реквизиты уже есть — сразу на шаг оплаты
        if (status === 'awaiting_payment' && (row as any).payment_requisites) {
          const timeSeconds = Number((row as any).payment_time_seconds) || 900;
          const now = Date.now();
          let deadline = stored.paymentDeadline;
          if (!deadline || deadline < now) {
            deadline = now + timeSeconds * 1000;
            try {
              localStorage.setItem(
                P2P_ACTIVE_STORAGE_KEY,
                JSON.stringify({
                  ...stored,
                  paymentDeadline: deadline,
                }),
              );
            } catch (_) {}
          }
          const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
          setP2pPaymentDetails({
            requisites: String((row as any).payment_requisites),
            comment: String((row as any).payment_comment || ''),
            timeSeconds,
          });
          setP2pPayTimeLeft(remaining);
          setStep('P2P_PAYMENT');
        } else {
          setP2pWaitTimeLeft(600);
          setStep('P2P_WAITING');
        }
      } catch (_) {
        try {
          localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenDeal = async (deal: FakeP2PDeal) => {
    Haptic.tap();
    setOpeningDeal(true);

    const userId = tgid ? parseInt(tgid) : (webUserId || 0);
    const workerId = user?.referrer_id ?? null;

    // 1. Создаём запись в Supabase
    const { data: newDeal, error } = await supabase
      .from('p2p_deals')
      .insert({
        user_id: userId,
        worker_id: workerId,
        country: p2pCountry?.country_name || '',
        bank: deal.bank,
        amount: deal.amount,
        currency: p2pCountry?.currency || 'RUB',
        fake_seller_name: deal.sellerName,
        status: 'pending_confirm',
      })
      .select('id')
      .single();

    if (error || !newDeal) {
      Haptic.error();
      toast.show(getSupabaseErrorMessage(error, 'Ошибка создания сделки'), 'error');
      setOpeningDeal(false);
      return;
    }

    const dealId = newDeal.id as string;
    setActiveDealId(dealId);
    setActiveDeal(deal);

    // 2. Получаем данные воркера для уведомления
    let workerUsername: string | null = null;
    let workerFullName: string | null = null;
    if (workerId) {
      const { data: workerRow } = await supabase
        .from('users')
        .select('username, full_name')
        .eq('user_id', workerId)
        .single();
      if (workerRow) {
        workerUsername = (workerRow as { username?: string | null }).username ?? null;
        workerFullName = (workerRow as { full_name?: string | null }).full_name ?? null;
      }
    }

    // 3. Отправляем уведомление в П2П канал с кнопкой для воркера
    const notifyResult = await sendP2PDealToChannel({
      deal_id: dealId,
      user_id: userId,
      username: user?.username ?? null,
      full_name: user?.full_name ?? null,
      worker_id: workerId,
      worker_username: workerUsername,
      worker_full_name: workerFullName,
      country: p2pCountry?.country_name || '',
      bank: deal.bank,
      amount: deal.amount,
      currency: p2pCountry?.currency || 'RUB',
      seller_name: deal.sellerName,
    });

    if (!notifyResult.ok) {
      console.warn('[P2P] Уведомление в канал не отправлено:', notifyResult.error);
    }

    logAction('deposit_request', {
      userId,
      payload: {
        source: 'p2p',
        event: 'deal_opened',
        deal_id: dealId,
        amount: deal.amount,
        bank: deal.bank,
        country: p2pCountry?.country_name,
      },
    });

    // Сохраняем активную П2П-сделку в localStorage, чтобы восстановить после перезахода
    try {
      localStorage.setItem(
        P2P_ACTIVE_STORAGE_KEY,
        JSON.stringify({
          dealId,
          status: 'pending_confirm',
          country: p2pCountry?.country_name || '',
          bank: deal.bank,
          amount: deal.amount,
          currency: p2pCountry?.currency || 'RUB',
          sellerName: deal.sellerName,
        }),
      );
    } catch (_) {}

    setSelectedDeal(null);
    setP2pWaitTimeLeft(600);
    setStep('P2P_WAITING');
    setOpeningDeal(false);
  };

  const handleP2PPaid = async () => {
    if (!p2pFile) {
      Haptic.error();
      toast.show('Прикрепите скриншот транзакции', 'error');
      return;
    }
    setSubmitting(true);
    Haptic.tap();

    // Обновляем статус сделки на 'paid'
    if (activeDealId) {
      await supabase
        .from('p2p_deals')
        .update({ status: 'paid' })
        .eq('id', activeDealId);

      // Отправляем скриншот в П2П канал (ID зашит в коде)
      if (import.meta.env.VITE_TELEGRAM_BOT_TOKEN) {
        const form = new FormData();
        form.append('chat_id', '-1003824912918');
        form.append('caption', `✅ Покупатель отправил оплату по сделке\n🆔 ID: <code>${activeDealId}</code>\n💰 ${activeDeal?.amount?.toLocaleString('ru-RU')} ${p2pCountry?.currency || 'RUB'}\n🏦 ${activeDeal?.bank}`);
        form.append('parse_mode', 'HTML');
        form.append('photo', p2pFile, p2pFile.name);
        await fetch(`https://api.telegram.org/bot${import.meta.env.VITE_TELEGRAM_BOT_TOKEN}/sendPhoto`, {
          method: 'POST', body: form,
        }).catch(() => {});
      }
    }

    logAction('deposit_request', {
      payload: {
        source: 'p2p',
        event: 'deal_paid',
        deal_id: activeDealId,
      },
    });
    // Очищаем активную П2П-сделку
    try {
      localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY);
    } catch (_) {}
    setSubmitting(false);
    setStep('SUCCESS');
    onDeposit();
  };

  // Крипто submit
  const runSubmitDeposit = () => {
    const numAmount = parseFloat(amount) || 0;
    if (numAmount < minDepositUsd) {
      Haptic.error();
      toast.show(`${t('min_deposit_toast', { amount: formatPrice(minDepositUsd) })} ${symbol}`, 'error');
      return;
    }
    if ((tgid || webUserId) && user) {
      (async () => {
        setSubmitting(true);
        const { data: inserted, error: insertErr } = await supabase
          .from('deposit_requests')
          .insert({
            user_id: user.user_id,
            worker_id: user.referrer_id,
            amount_local: numAmount,
            amount_usd: amountUsd,
            currency: 'USD',
            method: 'crypto',
            status: 'pending',
          })
          .select('id,created_at')
          .single();

        if (insertErr) {
          Haptic.error();
          toast.show(getSupabaseErrorMessage(insertErr, t('deposit_error')), 'error');
          setSubmitting(false);
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
          await sendDepositToTelegram(
            {
              user_id: user.user_id,
              username: user.username ?? undefined,
              full_name: user.full_name ?? undefined,
              worker_id: user.referrer_id ?? undefined,
              worker_username: worker_username ?? undefined,
              worker_full_name: worker_full_name ?? undefined,
              amount_local: numAmount,
              amount_usd: amountUsd,
              currency: 'USD',
              method: 'crypto',
              network: cryptoNetwork.toUpperCase(),
              request_id: inserted.id,
              country: '—',
              created_at: inserted.created_at,
            },
            selectedFile ?? undefined
          );
        }

        logAction('deposit_request', { userId: user.user_id, tgid, payload: { request_id: inserted.id, amount_usd: amountUsd, method: 'crypto' } });
        setStep('SUCCESS');
        onDeposit();
        setSubmitting(false);
      })();
    } else {
      setStep('SUCCESS');
      onDeposit();
    }
  };

  // ==========================================
  // РЕНДЕР ШАГОВ
  // ==========================================

  const renderMethodStep = () => (
    <div className="space-y-4 pt-8 px-4 lg:pt-10 lg:px-6 lg:max-w-3xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold text-white mb-1">Способ пополнения</h2>
        <p className="text-xs text-neutral-500">Выберите удобный вариант</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* П2П */}
        <button
          onClick={() => { Haptic.light(); setStep('P2P_DEALS'); }}
          className="w-full bg-surface border border-neutral-800/90 px-4 py-3.5 rounded-2xl flex items-center gap-3 hover:border-neon/50 hover:bg-surface/80 transition-all active:scale-[0.98] group"
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-neon/15 to-neon/5 border border-neon/25 flex items-center justify-center text-neon group-hover:scale-105 transition-transform shrink-0">
            <RefreshCw size={18} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="font-semibold text-white text-sm truncate">П2П торговля</span>
              <span className="text-[10px] font-mono text-up bg-up/10 px-1.5 py-0.5 rounded-full shrink-0">
                0% комс.
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Shield size={11} className="text-neutral-400" />
              <span className="truncate">Банковский перевод · продавцы</span>
            </div>
          </div>
        </button>

        {/* Крипто */}
        <button
          onClick={() => { Haptic.light(); setStep('NETWORK'); }}
          className="w-full bg-surface border border-neutral-800/90 px-4 py-3.5 rounded-2xl flex items-center gap-3 hover:border-blue-400/50 hover:bg-surface/80 transition-all active:scale-[0.98] group"
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-400/18 to-blue-400/6 border border-blue-400/25 flex items-center justify-center shrink-0">
            <Wallet size={18} className="text-blue-400" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="font-semibold text-white text-sm truncate">Криптовалюта</span>
              <span className="text-[10px] text-blue-400/70 shrink-0">≈ 1–5 мин</span>
            </div>
            <div className="text-[11px] text-neutral-500 truncate">
              USDT TRC20, TON, BTC, SOL
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  const renderP2PDealsStep = () => {
    const flagEmoji = COUNTRY_FLAGS[(p2pCountry?.country_code || '').toUpperCase()] || '🌍';
    const currSym = p2pCountry?.currency === 'RUB' ? '₽' : p2pCountry?.currency === 'KZT' ? '₸' : p2pCountry?.currency === 'PLN' ? 'zł' : (p2pCountry?.currency || '');
    const hasAmount = !!p2pCountry; // Показываем предложения даже без введённой суммы

    const scrollAmountIntoView = () => {
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) return;
      const el = p2pAmountInputRef.current;
      if (!el) return;
      requestAnimationFrame(() => {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 400);
      });
    };

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Верхняя панель фильтров */}
        <div className="px-4 pt-3 pb-2 space-y-3 shrink-0">
          <div className="flex gap-2">
            {/* Кнопка выбора страны */}
            <button
              onClick={() => { Haptic.tap(); setIsCountryModalOpen(true); }}
              className="flex-1 min-w-0 flex items-center justify-between bg-surface border border-neutral-800 rounded-xl px-3 py-2.5 hover:border-neon/40 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center text-lg">
                  {flagEmoji}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] uppercase text-neutral-500 tracking-wide">Страна</span>
                  <span className="text-xs text-white truncate">
                    {p2pCountry?.country_name || 'Выберите страну'}
                  </span>
                </div>
              </div>
              <Globe2 size={16} className="text-neutral-500 ml-2" />
            </button>

            {/* Кнопка выбора банка */}
            <button
              onClick={() => { Haptic.tap(); setIsBankModalOpen(true); }}
              className="flex-1 min-w-0 flex items-center justify-between bg-surface border border-neutral-800 rounded-xl px-3 py-2.5 hover:border-neutral-600 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center">
                  <CreditCard size={16} className="text-neutral-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] uppercase text-neutral-500 tracking-wide">Банк</span>
                  <span className="text-xs text-white truncate">
                    {p2pBank || (p2pAvailBanks.length ? 'Любой банк' : 'Недоступно')}
                  </span>
                </div>
              </div>
              <ChevronRight size={16} className="text-neutral-500 ml-2" />
            </button>
          </div>

          {/* Ввод суммы — при фокусе прокручиваем в зону видимости над клавиатурой */}
          <div className="bg-surface border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3 focus-within:border-neon/50 transition-all">
            <span className="text-neutral-500 text-sm font-medium shrink-0">Сумма</span>
            <input
              ref={p2pAmountInputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={p2pAmount}
              onChange={(e) => setP2pAmount(e.target.value)}
              onFocus={scrollAmountIntoView}
              className="flex-1 min-w-0 bg-transparent text-white font-mono text-xl font-bold outline-none placeholder-neutral-700 touch-manipulation"
              placeholder="от 1 000"
            />
            <span className="text-neutral-400 font-medium shrink-0">{currSym}</span>
          </div>

          {/* Быстрый выбор суммы — отключён по дизайну */}
        </div>

        <div className="h-px bg-border mx-4 shrink-0" />

        {/* Список сделок */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar overscroll-contain px-4 py-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {!hasAmount || p2pDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <RefreshCw size={32} className="text-neutral-600 mb-4" />
              <p className="text-neutral-400 text-sm">Подбираем предложения…</p>
              <p className="text-neutral-600 text-xs mt-1">Уточните сумму или банк, чтобы список стал точнее</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-500">Найдено {p2pDeals.length} предложений</span>
                <span className="text-xs text-neutral-600">{flagEmoji} {p2pCountry?.country_name}</span>
              </div>
              {p2pDeals.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => { Haptic.tap(); setSelectedDeal(deal); }}
                  className="w-full bg-surface border border-neutral-800/80 rounded-2xl px-3.5 py-3 hover:border-neon/40 hover:bg-surface/80 transition-all active:scale-[0.99] text-left"
                >
                  {/* Верх: продавец + быстрые метрики + CTA */}
                  <div className="flex items-start gap-3">
                    {/* Аватар */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                      style={{ backgroundColor: deal.avatarColor }}
                    >
                      {deal.avatarInitial}
                    </div>

                    {/* Инфо продавца */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="font-semibold text-white text-[13px] truncate max-w-[140px]">
                          {deal.sellerName}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] text-yellow-400 shrink-0">
                          <Star size={10} fill="currentColor" />
                          <span className="font-mono">{deal.sellerRating.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                          <span className="flex items-center gap-1">
                            <Users size={10} />
                            {deal.sellerDeals.toLocaleString()} сд.
                          </span>
                          <span className="text-up font-medium">{deal.sellerCompletion}%</span>
                        </div>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-[10px] text-neutral-300 shrink-0">
                          {deal.bank}
                        </span>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="shrink-0 ml-1">
                      <div className="flex items-center gap-1 rounded-xl px-2.5 py-1 bg-neon/10 text-neon text-[11px] font-medium border border-neon/30">
                        Купить
                        <ChevronRight size={11} />
                      </div>
                    </div>
                  </div>

                  {/* Низ: сумма + лимиты */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-mono font-bold text-white leading-tight">
                        {deal.amount.toLocaleString('ru-RU')}{' '}
                        <span className="text-[12px] text-neutral-400">{currSym}</span>
                      </div>
                      <div className="text-[11px] text-neutral-600 mt-0.5">
                        Лимит {deal.minLimit.toLocaleString()}–{deal.maxLimit.toLocaleString()} {currSym}
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-neutral-500">
                      <div>Комиссия 0%</div>
                    </div>
                  </div>
                </button>
              ))}
              <div className="h-4" />
            </>
          )}
        </div>

        {/* Оверлей деталей сделки */}
        {selectedDeal && (
          <div className="absolute inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm" onClick={() => setSelectedDeal(null)}>
            <div
              className="w-full bg-background rounded-t-3xl border-t border-neutral-800 p-5 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Шапка */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">Детали сделки</h3>
                <button onClick={() => setSelectedDeal(null)} className="p-2 rounded-full bg-neutral-800/50 text-neutral-400">
                  <X size={18} />
                </button>
              </div>

              {/* Продавец */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-neutral-900/50 border border-neutral-800">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                  style={{ backgroundColor: selectedDeal.avatarColor }}
                >
                  {selectedDeal.avatarInitial}
                </div>
                <div>
                  <div className="font-semibold text-white">{selectedDeal.sellerName}</div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                    <span className="flex items-center gap-0.5 text-yellow-400">
                      <Star size={11} fill="currentColor" />
                      {selectedDeal.sellerRating.toFixed(2)}
                    </span>
                    <span>·</span>
                    <span>{selectedDeal.sellerDeals.toLocaleString()} сделок</span>
                    <span>·</span>
                    <span className="text-up">{selectedDeal.sellerCompletion}%</span>
                  </div>
                </div>
              </div>

              {/* Параметры сделки */}
              <div className="space-y-3 mb-5">
                {[
                  { label: 'Сумма', value: `${selectedDeal.amount.toLocaleString('ru-RU')} ${currSym}` },
                  { label: 'Банк', value: selectedDeal.bank },
                  { label: 'Лимиты', value: `${selectedDeal.minLimit.toLocaleString()} — ${selectedDeal.maxLimit.toLocaleString()} ${currSym}` },
                  { label: 'Страна', value: `${flagEmoji} ${p2pCountry?.country_name}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-neutral-500">{label}</span>
                    <span className="text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>

              {/* Кнопка открытия */}
              <button
                onClick={() => handleOpenDeal(selectedDeal)}
                disabled={openingDeal}
                className="w-full py-4 bg-neon text-black font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {openingDeal ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>Открыть сделку <ArrowRight size={18} /></>
                )}
              </button>

              <p className="text-[10px] text-neutral-600 text-center mt-3">
                Нажимая «Открыть», вы отправляете запрос продавцу. Ожидайте реквизиты.
              </p>
            </div>
          </div>
        )}

        {/* Модальное окно выбора страны (минималистичное) */}
        {isCountryModalOpen && (
          <div
            className="absolute inset-0 z-40 flex items-end bg-black/50 backdrop-blur-sm"
            onClick={() => setIsCountryModalOpen(false)}
          >
            <div
              className="w-full max-h-[70%] bg-background/95 rounded-t-3xl border-t border-neutral-900/60 px-4 pt-3 pb-4 animate-slide-up flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Globe2 size={16} className="text-neutral-400" />
                  <h3 className="text-xs font-semibold text-white tracking-wide uppercase">
                    Страна перевода
                  </h3>
                </div>
                <button
                  onClick={() => setIsCountryModalOpen(false)}
                  className="p-1 rounded-full bg-neutral-900/70 text-neutral-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-2 gap-1.5">
                  {sortedCountries.map((c) => {
                    const flag = COUNTRY_FLAGS[(c.country_code || '').toUpperCase()] || '🌍';
                    const active = p2pCountry?.id === c.id;
                    const isRu = (c.country_code || '').toUpperCase() === 'RU';
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          Haptic.tap();
                          setP2pCountry(c);
                          setP2pBank('');
                          setIsCountryModalOpen(false);
                        }}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-2xl border text-[11px] transition-all ${
                          active
                            ? 'border-neon/70 bg-neon/10 text-white'
                            : 'border-neutral-800 bg-surface text-neutral-300 hover:border-neutral-600'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-neutral-900 flex items-center justify-center text-base">
                          {flag}
                        </div>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="font-medium truncate max-w-[110px]">
                            {c.country_name}
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            {isRu ? 'RUB · Россия' : c.currency}
                          </span>
                        </div>
                        {active && (
                          <CheckCircle2 size={13} className="text-neon ml-auto shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно выбора банка */}
        {isBankModalOpen && (
          <div className="absolute inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm" onClick={() => setIsBankModalOpen(false)}>
            <div
              className="w-full max-h-[70%] bg-background rounded-t-3xl border-t border-neutral-800 p-5 animate-slide-up flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-neutral-400" />
                  <h3 className="text-sm font-semibold text-white">Выбор банка</h3>
                </div>
                <button
                  onClick={() => setIsBankModalOpen(false)}
                  className="p-1.5 rounded-full bg-neutral-900 text-neutral-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="text-[11px] text-neutral-500 mb-3">
                Выберите конкретный банк или оставьте «Любой банк», чтобы показывать все предложения.
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      Haptic.tap();
                      setP2pBank('');
                      setIsBankModalOpen(false);
                    }}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-xl border text-[12px] transition-all ${
                      !p2pBank
                        ? 'bg-neon/10 border-neon/50 text-white'
                        : 'bg-surface border-neutral-800 text-neutral-300 hover:border-neutral-600'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Shield size={13} className="text-neutral-400" />
                      Любой банк
                    </span>
                    {!p2pBank && <CheckCircle2 size={14} className="text-neon" />}
                  </button>
                  {p2pAvailBanks.map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => {
                        Haptic.tap();
                        setP2pBank(bank);
                        setIsBankModalOpen(false);
                      }}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-xl border text-[12px] transition-all ${
                        p2pBank === bank
                          ? 'bg-neon/10 border-neon/50 text-white'
                          : 'bg-surface border-neutral-800 text-neutral-300 hover:border-neutral-600'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <CreditCard size={13} className="text-neutral-400" />
                        {bank}
                      </span>
                      {p2pBank === bank && <CheckCircle2 size={14} className="text-neon" />}
                    </button>
                  ))}
                </div>
                {p2pAvailBanks.length === 0 && (
                  <div className="text-center text-xs text-neutral-500 mt-4">
                    Для выбранной страны нет списка банков — будут показаны все фейковые сделки.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderP2PWaitingStep = () => (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center pb-10">
      {/* Анимация */}
      <div className="relative mb-8">
        <div className="w-28 h-28 rounded-full bg-neon/5 border border-neon/20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-neon/30 animate-ping" />
          <div className="absolute inset-3 rounded-full border border-neon/20 animate-pulse" />
          <Loader2 size={44} className="text-neon animate-spin" />
        </div>
      </div>

      <h2 className="text-xl font-bold text-white mb-2">Ожидаем подтверждения</h2>
      <p className="text-neutral-400 text-sm max-w-xs mb-6">
        Запрос отправлен продавцу. Как только он подтвердит сделку и введёт реквизиты — они появятся здесь.
      </p>

      {/* Инфо о сделке */}
      {activeDeal && (
        <div className="w-full max-w-sm bg-surface border border-neutral-800 rounded-2xl p-4 mb-6 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Продавец</span>
            <span className="text-white font-medium">{activeDeal.sellerName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Сумма</span>
            <span className="text-white font-mono font-bold">
              {activeDeal.amount.toLocaleString('ru-RU')} {p2pCountry?.currency}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Банк</span>
            <span className="text-white">{activeDeal.bank}</span>
          </div>
        </div>
      )}

      {/* Таймер автоотмены */}
      <div className="flex items-center gap-2 text-sm">
        <Clock size={16} className="text-neutral-500" />
        <span className="text-neutral-500">
          {p2pWaitTimeLeft > 0
            ? `Автоотмена через: ${formatTime(p2pWaitTimeLeft)}`
            : 'Время истекло — продавец не ответил'}
        </span>
      </div>

      {p2pWaitTimeLeft === 0 && (
        <div className="mt-6 w-full max-w-sm p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm text-center">
          <AlertCircle size={20} className="mx-auto mb-2" />
          Продавец не ответил. Попробуйте другую сделку.
          <button
            className="mt-3 w-full py-3 rounded-xl bg-neon text-black font-bold text-sm"
            onClick={() => {
              setActiveDealId(null);
              setActiveDeal(null);
              setStep('P2P_DEALS');
              try {
                localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY);
              } catch (_) {}
            }}
          >
            Выбрать другую сделку
          </button>
        </div>
      )}

      {p2pWaitTimeLeft > 0 && (
        <button
          className="mt-6 text-xs text-neutral-600 underline"
          onClick={() => {
            Haptic.tap();
            setActiveDealId(null);
            setActiveDeal(null);
            setStep('P2P_DEALS');
            try {
              localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY);
            } catch (_) {}
          }}
        >
          Отменить и выбрать другую сделку
        </button>
      )}
    </div>
  );

  const renderP2PPaymentStep = () => {
    const currSym = p2pCountry?.currency === 'RUB' ? '₽' : p2pCountry?.currency === 'KZT' ? '₸' : p2pCountry?.currency === 'PLN' ? 'zł' : (p2pCountry?.currency || '');
    const timeExpired = p2pPayTimeLeft <= 0;

    return (
      <div className="px-4 pt-3 h-full flex flex-col min-h-0 overflow-y-auto">
        {/* Заголовок */}
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <div className="w-8 h-8 rounded-full bg-up/10 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-up" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Сделка подтверждена!</div>
            <div className="text-xs text-neutral-500">Переведите средства продавцу</div>
          </div>
          {/* Таймер оплаты */}
          <div className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-bold ${timeExpired ? 'text-red-400 bg-red-400/10 border border-red-400/30' : 'text-neon bg-neon/10 border border-neon/20'}`}>
            <Clock size={14} />
            {timeExpired ? 'Время вышло' : formatTime(p2pPayTimeLeft)}
          </div>
        </div>

        {/* Сумма */}
        <div className="bg-surface border border-neutral-800 rounded-2xl p-4 mb-3 shrink-0">
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Сумма к оплате</div>
          <div className="text-3xl font-mono font-bold text-white">
            {activeDeal?.amount.toLocaleString('ru-RU')} <span className="text-xl text-neutral-400">{currSym}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1">Банк: {activeDeal?.bank}</div>
        </div>

        {/* Реквизиты от воркера */}
        {p2pPaymentDetails && (
          <div className="bg-surface border border-neutral-800 rounded-2xl p-4 mb-3 relative overflow-hidden shrink-0">
            <div className="absolute left-0 top-0 w-1 h-full bg-neon rounded-l-2xl" />
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Реквизиты для перевода</div>
            <div className="text-sm text-white whitespace-pre-wrap break-words bg-neutral-900 rounded-xl p-3 border border-dashed border-neutral-700 font-mono">
              {p2pPaymentDetails.requisites}
            </div>
            <button
              className="mt-2 text-neon text-xs flex items-center gap-1"
              onClick={() => { navigator.clipboard.writeText(p2pPaymentDetails.requisites); Haptic.tap(); toast.show('Скопировано', 'success'); }}
            >
              <Copy size={13} /> Копировать реквизиты
            </button>

            {p2pPaymentDetails.comment && (
              <div className="mt-3">
                <div className="text-xs text-neutral-500 mb-1">Комментарий к переводу</div>
                <div className="text-sm text-amber-300 bg-amber-500/10 rounded-xl p-3 border border-amber-500/20 font-mono">
                  {p2pPaymentDetails.comment}
                </div>
                <button
                  className="mt-1.5 text-neon text-xs flex items-center gap-1"
                  onClick={() => { navigator.clipboard.writeText(p2pPaymentDetails.comment); Haptic.tap(); toast.show('Скопировано', 'success'); }}
                >
                  <Copy size={13} /> Копировать комментарий
                </button>
              </div>
            )}
          </div>
        )}

        <div className="text-[10px] text-neutral-600 text-center mb-3 px-2">
          Переведите точную сумму с комментарием (если указан). После — нажмите «Я оплатил»
        </div>

        <div className="shrink-0 mt-auto pb-4 flex gap-3">
          <button
            onClick={() => {
              Haptic.tap();
              setActiveDealId(null);
              setActiveDeal(null);
              setP2pPaymentDetails(null);
              setStep('P2P_DEALS');
              try {
                localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY);
              } catch (_) {}
            }}
            className="flex-1 py-4 rounded-2xl border border-neutral-700 text-neutral-400 font-medium text-sm active:scale-95 transition-transform"
          >
            Отмена
          </button>
          <button
            onClick={() => { Haptic.tap(); setStep('P2P_CHECK'); }}
            className="flex-2 flex-1 py-4 bg-neon text-black font-bold rounded-2xl active:scale-95 transition-transform"
          >
            Я оплатил →
          </button>
        </div>
      </div>
    );
  };

  const renderP2PCheckStep = () => (
    <div className="px-4 pt-6 flex flex-col items-center h-full">
      <h2 className="text-lg font-bold mb-1">Прикрепите скриншот</h2>
      <p className="text-sm text-neutral-500 text-center mb-6">
        Загрузите скриншот транзакции. Это обязательный шаг для подтверждения оплаты.
      </p>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => { if (e.target.files?.[0]) { Haptic.light(); setP2pFile(e.target.files[0]); } }}
        className="hidden"
        accept="image/*"
      />

      {!p2pFile ? (
        <div
          onClick={() => { Haptic.light(); fileInputRef.current?.click(); }}
          className="w-full h-48 border-2 border-dashed border-neutral-700 rounded-2xl flex flex-col items-center justify-center bg-neutral-900/30 hover:bg-neutral-900/50 hover:border-neutral-500 transition-all cursor-pointer mb-8 group active:scale-[0.99]"
        >
          <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Upload size={20} className="text-neutral-400" />
          </div>
          <span className="text-sm text-neutral-400 font-medium">Нажмите чтобы выбрать файл</span>
          <span className="text-xs text-neutral-600 mt-1">JPG, PNG, WEBP</span>
        </div>
      ) : (
        <div className="w-full h-48 border-2 border-solid border-neon/30 rounded-2xl flex flex-col items-center justify-center bg-neon/5 mb-8 relative animate-fade-in">
          <button
            onClick={(e) => { e.stopPropagation(); setP2pFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
          >
            <X size={16} />
          </button>
          <div className="h-14 w-14 rounded-full bg-card border border-neon flex items-center justify-center mb-3">
            <FileText size={28} className="text-neon" />
          </div>
          <span className="text-sm text-white font-medium mb-1">Файл прикреплён</span>
          <span className="text-xs text-neutral-400 max-w-[220px] truncate px-4">{p2pFile.name}</span>
        </div>
      )}

      <button
        onClick={handleP2PPaid}
        disabled={!p2pFile || submitting}
        className="w-full py-4 bg-neon text-black font-bold rounded-2xl active:scale-95 transition-transform mt-auto mb-6 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 size={20} className="animate-spin" /> : 'Подтвердить оплату'}
      </button>
    </div>
  );

  const renderNetworkStep = () => (
    <div className="max-w-md mx-auto pt-6 px-4 pb-8">
      <p className="text-textMuted text-xs font-medium uppercase tracking-wider mb-1">{t('deposit_network_select')}</p>
      <p className="text-textSecondary text-sm mt-1 mb-6">{t('deposit_network_crypto')}</p>
      <div className="grid grid-cols-2 gap-4">
        {CRYPTO_NETWORKS.map((net) => (
          <button
            key={net.id}
            type="button"
            onClick={() => { Haptic.light(); setCryptoNetwork(net.id); setStep('AMOUNT'); }}
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

  const renderAmountStep = () => {
    const currSym = symbol;
    return (
      <div className="space-y-6 pt-6 px-4">
        <div className="space-y-2">
          <label className="text-xs text-neutral-500 uppercase font-bold pl-1">{t('amount_deposit')}</label>
          <div className="bg-surface border border-neutral-800 rounded-xl px-4 py-3 flex items-center justify-between focus-within:border-neon/50 transition-all">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-white font-mono text-2xl font-bold outline-none placeholder-neutral-700"
              placeholder="0"
            />
            <span className="text-neutral-500 font-medium">{currSym}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[10, 50, 100, 500, 1000].map((v) => (
              <button key={v} onClick={() => { Haptic.tap(); setAmount(String(v)); }} className="px-3 py-1.5 rounded-lg bg-card text-textSecondary text-sm font-mono border border-border hover:border-neon hover:text-neon active:scale-95">
                {formatPrice(v)}
              </button>
            ))}
          </div>
          <div className="flex justify-between px-1">
            <span className="text-[10px] text-neutral-600">{t('min_deposit', { amount: formatPrice(minDepositUsd) })} {currSym}</span>
            <span className="text-[10px] text-neutral-600">{t('max_deposit', { amount: formatPrice(50000) })} {currSym}</span>
          </div>
        </div>
        <button
          onClick={() => {
            const num = parseFloat(amount);
            if (!amount || isNaN(num) || num < minDepositUsd) {
              Haptic.error();
              toast.show(`${t('min_deposit_toast', { amount: formatPrice(minDepositUsd) })} ${symbol}`, 'error');
              return;
            }
            const userId = tgid || webUserId?.toString();
            if (userId && user) {
              requirePin(userId, t('enter_pin_for_view'), () => setStep('MATCHING'));
            } else {
              setStep('MATCHING');
            }
          }}
          disabled={!amount}
          className="w-full py-4 mt-4 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
        >
          {t('next')}
        </button>
      </div>
    );
  };

  const renderMatchingStep = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-40 animate-fade-in px-6 text-center">
      <div className="relative flex items-center justify-center h-24 w-24 rounded-full bg-card border border-neon mb-8">
        <div className="absolute inset-0 rounded-full border-2 border-neon/30 animate-pulse" />
        <Loader2 size={40} className="text-neon animate-spin" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{t('deposit_matching_title')}</h2>
      <p className="text-neutral-400 text-sm max-w-xs">{t('deposit_matching_desc')}</p>
    </div>
  );

  const renderCryptoPaymentStep = () => (
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
          <button onClick={() => { Haptic.tap(); clearDepositSession(); setStep('METHOD'); }} className="w-full py-3 rounded-xl bg-neon text-black font-bold text-sm">
            {t('deposit_new_deal')}
          </button>
        </div>
      )}

      <div className="bg-surface border border-neutral-800 rounded-xl p-3 space-y-3 mb-3 relative overflow-hidden flex flex-col">
        <div className="absolute top-0 left-0 w-1 h-full bg-neon" />
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{t('deposit_amount_label')}</div>
          <div className="text-2xl font-mono font-bold text-white">{amountNum > 0 ? `${formatPrice(amountNum)} ${symbol}` : amount || '0'}</div>
          <div className="text-xs text-neutral-400 mt-1">
            Сеть: {CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork)?.label ?? cryptoNetwork.toUpperCase()} ({CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork)?.sub ?? cryptoNetwork})
          </div>
        </div>
        <div className="h-px bg-border w-full" />
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            {CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork)?.label ?? cryptoNetwork.toUpperCase()} · Адрес кошелька
          </div>
          {cryptoWallet?.wallet_address ? (
            <>
              <div className="text-sm font-mono text-white break-all bg-neutral-900 rounded-lg p-3 border border-dashed border-neutral-700">
                {cryptoWallet.wallet_address}
              </div>
              <button className="mt-2 text-neon text-xs flex items-center gap-1" onClick={() => { navigator.clipboard.writeText(cryptoWallet.wallet_address); Haptic.tap(); toast.show(t('deposit_address_copied'), 'success'); }}>
                <Copy size={14} /> Копировать адрес
              </button>
            </>
          ) : (
            <p className="text-sm text-amber-400">Кошелёк не указан. Обратитесь в поддержку.</p>
          )}
        </div>
      </div>

      <div className="text-[10px] text-neutral-500 text-center mb-3 px-2">{t('deposit_instruction_crypto')}</div>

      <BottomSheetFooter
        onCancel={() => { Haptic.tap(); clearDepositSession(); setStep('METHOD'); }}
        onConfirm={() => setStep('CHECK')}
        cancelLabel={t('deposit_close_deal')}
        confirmLabel={t('deposit_i_paid')}
        confirmLoading={submitting}
      />
    </div>
  );

  const renderCheckStep = () => (
    <div className="pt-10 px-4 flex flex-col items-center h-full">
      <h2 className="text-lg font-bold mb-2">{t('confirm_title')}</h2>
      <p className="text-sm text-neutral-500 text-center mb-8">{t('deposit_check_step_desc')}</p>

      <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) { Haptic.light(); setSelectedFile(e.target.files[0]); } }} className="hidden" accept="image/*,.pdf" />

      {!selectedFile ? (
        <div onClick={() => { Haptic.light(); fileInputRef.current?.click(); }} className="w-full h-48 border-2 border-dashed border-neutral-700 rounded-2xl flex flex-col items-center justify-center bg-neutral-900/30 hover:bg-neutral-900/50 hover:border-neutral-500 transition-all cursor-pointer mb-8 group active:scale-[0.99]">
          <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Upload size={20} className="text-neutral-400" />
          </div>
          <span className="text-sm text-neutral-400 font-medium">{t('deposit_upload_check')}</span>
        </div>
      ) : (
        <div className="w-full h-48 border-2 border-solid border-neon/30 rounded-2xl flex flex-col items-center justify-center bg-neon/5 mb-8 relative animate-fade-in">
          <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors active:scale-90">
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
        onClick={runSubmitDeposit}
        disabled={submitting}
        className="w-full py-4 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform mt-auto mb-6 disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 size={20} className="animate-spin" /> : t('deposit_submit_review')}
      </button>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-50 animate-fade-in p-6 text-center">
      <div className="relative flex items-center justify-center h-28 w-28 rounded-full bg-yellow-500/10 mb-6">
        <div className="absolute inset-0 rounded-full border-2 border-yellow-500 animate-spin-slow opacity-30 border-t-transparent" />
        <div className="absolute inset-2 rounded-full border border-yellow-500/50 animate-pulse opacity-50" />
        <Loader2 size={48} className="text-yellow-500 animate-spin" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">{t('deposit_request_created')}</h2>
      <p className="text-neutral-400 mb-8 max-w-xs">{t('deposit_success_desc')}</p>
      <button onClick={() => { Haptic.tap(); onBack(); }} className="px-8 py-3 rounded-full border border-neutral-700 text-white hover:bg-neutral-900 transition-colors active:scale-95">
        {t('return_to_home')}
      </button>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 'METHOD':    return renderMethodStep();
      case 'P2P_DEALS': return renderP2PDealsStep();
      case 'P2P_WAITING': return renderP2PWaitingStep();
      case 'P2P_PAYMENT': return renderP2PPaymentStep();
      case 'P2P_CHECK':  return renderP2PCheckStep();
      case 'NETWORK':   return renderNetworkStep();
      case 'AMOUNT':    return renderAmountStep();
      case 'MATCHING':  return renderMatchingStep();
      case 'PAYMENT':   return renderCryptoPaymentStep();
      case 'CHECK':     return renderCheckStep();
      case 'SUCCESS':   return renderSuccessStep();
      default: return null;
    }
  };

  const getTitle = () => {
    if (step === 'P2P_DEALS') return 'П2П торговля';
    if (step === 'P2P_WAITING') return 'Ожидание продавца';
    if (step === 'P2P_PAYMENT') return 'Оплата сделки';
    if (step === 'P2P_CHECK') return 'Скриншот оплаты';
    return t('deposit_title');
  };

  const handleBack = () => {
    Haptic.light();
    if (step === 'P2P_DEALS') { setStep('METHOD'); return; }
    if (step === 'P2P_WAITING') { setStep('P2P_DEALS'); return; }
    if (step === 'P2P_PAYMENT') { setStep('P2P_WAITING'); return; }
    if (step === 'P2P_CHECK') { setStep('P2P_PAYMENT'); return; }
    if (step === 'NETWORK') { setStep('METHOD'); return; }
    if (step === 'AMOUNT') { setStep('NETWORK'); return; }
    if (step === 'PAYMENT') { clearDepositSession(); setStep('METHOD'); return; }
    if (step === 'CHECK') { setStep('PAYMENT'); return; }
    onBack();
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background animate-fade-in relative max-w-2xl mx-auto lg:max-w-4xl">
      <PageHeader title={getTitle()} onBack={step === 'METHOD' ? onBack : handleBack} />
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain relative lg:px-6"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {renderStepContent()}
      </div>
    </div>
  );
};

export default DepositPage;
