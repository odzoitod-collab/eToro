import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Wallet, Copy, Upload, Loader2, Clock, X, FileText,
  Star, CheckCircle2, Shield, RefreshCw, ChevronRight,
  ArrowRight, Users, AlertCircle, Globe2, CreditCard,
  ChevronDown, Search, Banknote, Zap, TrendingUp,
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
  sendReferralP2PActivatedToWorker,
  sendReferralP2PRequisitesToWorker,
  sendReferralP2PPaidToWorker,
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
  onHideNav?: (hide: boolean) => void;
}

type Step =
  | 'METHOD'
  | 'AUTO_P2P_INPUT'
  | 'AUTO_P2P_MATCHING'
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
  RU: ['Александр К.', 'Dmitry_P2P', 'crypto_alex77', 'Виктор С.', 'Maria_Trade', 'TradePro_RU', 'Pavel_Finance', 'Sergei_PRO', 'Nikita_FX', 'Oleg_Crypto', 'Anna_P2P', 'Max_Trader', 'Igor_Finance', 'Elena_Trade', 'Ruslan_Pro'],
  KZ: ['Nurasyl_KZ', 'AstanaTrader', 'Damir_P2P', 'kz_crypto_pro', 'Алибек Д.', 'Beibit_Trade', 'KZ_MoneyPro', 'Aibek_Finance', 'Zarina_Trade', 'Nursultan_P2P'],
  PL: ['Pawel_Trade', 'crypto_pl_77', 'Warsaw_P2P', 'Marek_Pro', 'Anna_Trade', 'PLN_Master', 'Krakow_Crypto', 'Tomasz_FX', 'Piotr_Finance', 'Katarzyna_P2P'],
  UA: ['Andrii_UA', 'Kyiv_Trader', 'ua_crypto', 'Dmytro_P2P', 'Olena_Trade', 'UkrCrypto', 'Lviv_P2P', 'Mykola_Finance', 'Oksana_Trade', 'Vasyl_Pro'],
  DE: ['Hans_Trade', 'Berlin_P2P', 'crypto_de_88', 'Klaus_Finance', 'DE_Trader', 'Euro_Pro', 'Frankfurt_C', 'Stefan_FX', 'Lukas_Trade', 'Mia_Finance'],
  TR: ['Ahmet_Trade', 'Istanbul_P2P', 'tr_crypto_pro', 'Mehmet_Finance', 'TR_Trader', 'Ankara_P2P', 'Emre_FX', 'Fatih_Trade', 'Selin_Pro', 'Burak_Finance'],
  BY: ['Vitaly_BY', 'Minsk_Trader', 'by_crypto', 'Artem_P2P', 'Natasha_Trade', 'BelCrypto', 'Grodno_P2P'],
  UZ: ['Bobur_UZ', 'Tashkent_P2P', 'uz_crypto', 'Jasur_Trade', 'Malika_Finance', 'UzCrypto', 'Samarkand_P2P'],
  AZ: ['Elchin_AZ', 'Baku_Trader', 'az_crypto', 'Nigar_P2P', 'Rashad_Trade', 'AzCrypto', 'Ganja_P2P'],
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
const P2P_NOTIFY_PREFIX = 'etoro_p2p_notify_v1';

function safeMammothName(user: any): string {
  return (user?.full_name || user?.username || 'Клиент').toString().trim() || 'Клиент';
}

function onceP2PNotify(key: string): boolean {
  try {
    const k = `${P2P_NOTIFY_PREFIX}:${key}`;
    if (localStorage.getItem(k) === '1') return false;
    localStorage.setItem(k, '1');
    return true;
  } catch {
    return true;
  }
}

function getP2PMinLocal(country: CountryBank, minDepositUsd: number): number {
  const rate = country.exchange_rate || 1;
  const workerMinLocalRaw = (minDepositUsd || 0) * rate;
  const fallbackLocalRaw = 1000 * rate;
  const baseMinLocalRaw = workerMinLocalRaw > 0 ? workerMinLocalRaw : fallbackLocalRaw;
  return Math.round(baseMinLocalRaw / 100) * 100;
}

function seededRandom(seed: number, offset = 0): number {
  const x = Math.sin(seed * 9301 + offset * 49297 + 233) * 10000;
  return x - Math.floor(x);
}

function generateFakeDeals(
  amount: number,
  country: CountryBank,
  bankFilter: string,
  minDepositUsd: number,
  forceRandom = false,
): FakeP2PDeal[] {
  const minLocal = getP2PMinLocal(country, minDepositUsd);
  const safeAmount = forceRandom ? minLocal * (2 + Math.random() * 8) : Math.max(amount, minLocal);
  const code = (country.country_code || 'RU').toUpperCase();
  const sellers = SELLERS_BY_COUNTRY[code] || DEFAULT_SELLERS;
  const allBanks = BANKS_BY_COUNTRY[code] || ['Bank'];
  const seed = forceRandom ? Math.floor(Date.now() / 30000) : Math.round(safeAmount);

  const target = Math.round(safeAmount / 100) * 100;
  const multipliers = [0.55, 0.65, 0.72, 0.8, 0.87, 0.93, 0.97, 1.0, 1.04, 1.08, 1.15, 1.22, 1.3, 1.4, 1.55, 1.7, 1.9, 2.1];
  const deals: FakeP2PDeal[] = [];

  for (let i = 0; i < multipliers.length; i++) {
    const mult = multipliers[i];
    let dealAmount = Math.round(target * mult / 100) * 100;
    if (dealAmount < minLocal) dealAmount = minLocal;

    const banksPool = bankFilter ? [bankFilter] : allBanks;
    const bank = banksPool[Math.floor(seededRandom(seed, i * 7 + 1) * banksPool.length)];
    const sellerName = sellers[Math.floor(seededRandom(seed, i * 3) * sellers.length)];
    const sellerDeals = 150 + Math.floor(seededRandom(seed, i * 11) * 12000);
    const rating = Math.round((4.7 + seededRandom(seed, i * 13) * 0.29) * 100) / 100;
    const completion = Math.round((94.0 + seededRandom(seed, i * 17) * 5.5) * 10) / 10;
    const colorIdx = Math.floor(seededRandom(seed, i * 19) * AVATAR_COLORS.length);
    const avatarInitial = sellerName.charAt(0).toUpperCase();

    const minLimit = Math.max(minLocal, Math.round(dealAmount * 0.2 / 100) * 100);
    const maxLimit = Math.round(dealAmount * 8 / 100) * 100;

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

  if (forceRandom) {
    return deals.sort(() => seededRandom(seed, Math.random() * 100) - 0.5).slice(0, 14);
  }

  return deals
    .sort((a, b) => {
      const byDiff = Math.abs(a.amount - target) - Math.abs(b.amount - target);
      if (byDiff !== 0) return byDiff;
      return b.sellerRating - a.sellerRating;
    })
    .slice(0, 14);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getCurrSymbol(currency?: string): string {
  if (currency === 'RUB') return '₽';
  if (currency === 'KZT') return '₸';
  if (currency === 'PLN') return 'zł';
  if (currency === 'UAH') return '₴';
  if (currency === 'EUR') return '€';
  if (currency === 'USD') return '$';
  return currency || '';
}

// ==========================================
// BOTTOM SHEET COMPONENT
// ==========================================

const FullScreenSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-[28px] flex flex-col"
        style={{
          background: '#1c212e',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
          maxHeight: '88vh',
          animation: 'sheetUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-base font-bold text-white">{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <X size={15} className="text-neutral-300" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-8 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// DEAL DETAIL SHEET
// ==========================================

const DealDetailSheet: React.FC<{
  deal: FakeP2PDeal | null;
  currSym: string;
  flagEmoji: string;
  countryName: string;
  onClose: () => void;
  onOpen: (deal: FakeP2PDeal) => void;
  opening: boolean;
}> = ({ deal, currSym, flagEmoji, countryName, onClose, onOpen, opening }) => {
  useEffect(() => {
    if (deal) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [deal]);

  if (!deal) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl"
        style={{
          background: '#1c212e',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          animation: 'sheetUp 0.26s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-700" />
        </div>

        <div className="px-5 pt-3 pb-6">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
              style={{ backgroundColor: deal.avatarColor }}
            >
              {deal.avatarInitial}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-base">{deal.sellerName}</span>
                <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                  <Star size={11} fill="currentColor" />
                  {deal.sellerRating.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <Users size={10} />
                  {deal.sellerDeals.toLocaleString()} сд.
                </span>
                <span className="text-green-400">{deal.sellerCompletion}%</span>
                <span className="text-neutral-600">завершено</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden mb-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              { label: 'Сумма сделки', value: `${deal.amount.toLocaleString('ru-RU')} ${currSym}`, highlight: true },
              { label: 'Банк', value: deal.bank },
              { label: 'Лимиты', value: `${deal.minLimit.toLocaleString()} — ${deal.maxLimit.toLocaleString()} ${currSym}` },
              { label: 'Страна', value: `${flagEmoji} ${countryName}` },
              { label: 'Комиссия', value: '0%' },
            ].map(({ label, value, highlight }, i) => (
              <div key={label} className="flex justify-between items-center px-4 py-3" style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
                <span className="text-neutral-500 text-sm">{label}</span>
                <span className={`text-sm font-semibold ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => onOpen(deal)}
            disabled={opening}
            className="w-full py-3.5 rounded-card font-semibold text-sm text-black flex items-center justify-center gap-2 transition-etoro active:scale-[0.98] disabled:opacity-60"
            style={{ background: '#21B053' }}
          >
            {opening ? <Loader2 size={18} className="animate-spin" /> : <>Купить <ArrowRight size={16} /></>}
          </button>

          <p className="text-[10px] text-textSubtle text-center mt-3">
            Запрос уйдёт продавцу · Ожидайте реквизиты
          </p>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// КОМПОНЕНТ
// ==========================================

const DepositPage: React.FC<DepositPageProps> = ({ onBack, onDeposit, onHideNav }) => {
  const { formatPrice, symbol } = useCurrency();
  const { user, tgid, minDepositUsd, countries, cryptoWallets } = useUser();
  const { webUserId } = useWebAuth();
  const { requirePin } = usePin();
  const toast = useToast();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredSessionRef = useRef(false);
  const p2pAmountInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('METHOD');
  const [submitting, setSubmitting] = useState(false);

  // P2P state
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
  const [p2pPaymentMinDelayLeft, setP2pPaymentMinDelayLeft] = useState(0);
  const [countrySearch, setCountrySearch] = useState('');

  // Crypto state
  const [cryptoNetwork, setCryptoNetwork] = useState<CryptoNetwork>('trc20');
  const [amount, setAmount] = useState('');
  const [senderName, setSenderName] = useState('');
  const [timeLeft, setTimeLeft] = useState(DEPOSIT_TIMER_SECONDS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [guestContact, setGuestContact] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryBank | null>(null);

  const country = selectedCountry ?? countries?.[0];
  const cryptoWallet = cryptoWallets.find((w) => w.network === cryptoNetwork) ?? null;
  const amountNum = parseFloat(amount) || 0;
  const amountUsd = amountNum;

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

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return sortedCountries;
    return sortedCountries.filter(c =>
      c.country_name.toLowerCase().includes(countrySearch.toLowerCase())
    );
  }, [sortedCountries, countrySearch]);

  useEffect(() => {
    if (p2pCountry || !sortedCountries.length) return;
    const ru = sortedCountries.find((c) => (c.country_code || '').toUpperCase() === 'RU');
    setP2pCountry(ru || sortedCountries[0]);
  }, [sortedCountries, p2pCountry]);

  // Скрываем навигацию при открытии модалок или на определённых шагах
  useEffect(() => {
    const shouldHide =
      isBankModalOpen ||
      isCountryModalOpen ||
      selectedDeal !== null ||
      ['P2P_WAITING', 'P2P_PAYMENT', 'P2P_CHECK', 'AUTO_P2P_INPUT', 'AUTO_P2P_MATCHING', 'AMOUNT', 'NETWORK', 'MATCHING', 'PAYMENT', 'CHECK', 'SUCCESS'].includes(step);
    onHideNav?.(shouldHide);
  }, [step, isBankModalOpen, isCountryModalOpen, selectedDeal, onHideNav]);

  const p2pDeals = useMemo<FakeP2PDeal[]>(() => {
    if (!p2pCountry) return [];
    const num = parseFloat(p2pAmount);
    const hasValidAmount = Number.isFinite(num) && num > 0;
    const minLocal = getP2PMinLocal(p2pCountry, minDepositUsd);

    if (!hasValidAmount || num < minLocal) {
      return generateFakeDeals(0, p2pCountry, p2pBank, minDepositUsd, true);
    }
    return generateFakeDeals(num, p2pCountry, p2pBank, minDepositUsd);
  }, [p2pAmount, p2pCountry, p2pBank, minDepositUsd]);

  const p2pAvailBanks = useMemo<string[]>(() => {
    if (!p2pCountry) return [];
    const code = (p2pCountry.country_code || '').toUpperCase();
    return BANKS_BY_COUNTRY[code] || [];
  }, [p2pCountry]);

  // Restore crypto session
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

  useEffect(() => {
    if (step !== 'P2P_WAITING' || p2pWaitTimeLeft <= 0) return;
    const iv = setInterval(() => {
      setP2pWaitTimeLeft((prev) => { if (prev <= 1) return 0; return prev - 1; });
    }, 1000);
    return () => clearInterval(iv);
  }, [step, p2pWaitTimeLeft]);

  useEffect(() => {
    if (step !== 'P2P_PAYMENT' || p2pPayTimeLeft <= 0) return;
    const iv = setInterval(() => {
      setP2pPayTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [step, p2pPayTimeLeft]);

  useEffect(() => {
    if (step !== 'P2P_PAYMENT') return;
    setP2pPaymentMinDelayLeft(5);
    const iv = setInterval(() => {
      setP2pPaymentMinDelayLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [step]);

  useEffect(() => {
    if (step !== 'P2P_WAITING' || !activeDealId) return;
    const channel = supabase
      .channel(`p2p_deal_${activeDealId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'p2p_deals', filter: `id=eq.${activeDealId}` }, (payload) => {
        const rec = payload.new as Record<string, unknown>;
        if (rec.status === 'awaiting_payment' && rec.payment_requisites) {
          const timeSeconds = Number(rec.payment_time_seconds) || 900;
          const deadline = Date.now() + timeSeconds * 1000;
          setP2pPaymentDetails({ requisites: String(rec.payment_requisites), comment: String(rec.payment_comment || ''), timeSeconds });
          setP2pPayTimeLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
          setStep('P2P_PAYMENT');
          Haptic.success?.();
          toast.show('✅ Продавец подтвердил сделку!', 'success');
          const workerId = user?.referrer_id ?? null;
          if (workerId && onceP2PNotify(`reqs:${String(rec.id || activeDealId)}`)) {
            sendReferralP2PRequisitesToWorker(workerId, { mammoth_name: safeMammothName(user), mammoth_username: user?.username ?? undefined, mammoth_id: user?.user_id ?? undefined, deal_id: String(rec.id || activeDealId || ''), bank: String((activeDeal as any)?.bank || '') }).catch(() => {});
          }
          try {
            const storedRaw = localStorage.getItem(P2P_ACTIVE_STORAGE_KEY);
            const stored = storedRaw ? JSON.parse(storedRaw) as any : {};
            localStorage.setItem(P2P_ACTIVE_STORAGE_KEY, JSON.stringify({ ...stored, dealId: rec.id, status: rec.status, paymentDeadline: deadline }));
          } catch (_) {}
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [step, activeDealId]);

  // Restore active P2P
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(P2P_ACTIVE_STORAGE_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as any;
        if (!stored.dealId) return;
        const { data: row, error } = await supabase.from('p2p_deals').select('*').eq('id', stored.dealId).single();
        if (error || !row) { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); return; }
        const status = (row as any).status as string;
        if (['paid', 'completed', 'cancelled', 'expired'].includes(status)) { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); return; }
        const amount = Number((row as any).amount || stored.amount || 0);
        const bank = (row as any).bank || stored.bank || '';
        const sellerName = (row as any).fake_seller_name || stored.sellerName || 'P2P Trader';
        const colorIdx = Math.floor(seededRandom(Date.now(), 1) * AVATAR_COLORS.length);
        const restoredDeal: FakeP2PDeal = { id: stored.dealId, sellerName, sellerDeals: 3000, sellerRating: 4.95, sellerCompletion: 98.5, bank, amount, minLimit: Math.max(1000, Math.round(amount * 0.3 / 100) * 100), maxLimit: Math.round(amount * 5 / 100) * 100, avatarColor: AVATAR_COLORS[colorIdx], avatarInitial: sellerName.charAt(0).toUpperCase() };
        setActiveDealId(stored.dealId);
        setActiveDeal(restoredDeal);
        if (status === 'awaiting_payment' && (row as any).payment_requisites) {
          const timeSeconds = Number((row as any).payment_time_seconds) || 900;
          const now = Date.now();
          let deadline = stored.paymentDeadline;
          if (!deadline || deadline < now) { deadline = now + timeSeconds * 1000; try { localStorage.setItem(P2P_ACTIVE_STORAGE_KEY, JSON.stringify({ ...stored, paymentDeadline: deadline })); } catch (_) {} }
          setP2pPaymentDetails({ requisites: String((row as any).payment_requisites), comment: String((row as any).payment_comment || ''), timeSeconds });
          setP2pPayTimeLeft(Math.max(0, Math.floor((deadline - now) / 1000)));
          setStep('P2P_PAYMENT');
        } else {
          setP2pWaitTimeLeft(600);
          setStep('P2P_WAITING');
        }
      } catch (_) { try { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); } catch { } }
    })();
  }, []);

  const handleOpenDeal = async (deal: FakeP2PDeal) => {
    Haptic.tap();
    setOpeningDeal(true);
    const rawUserId = user?.user_id ?? (tgid ? parseInt(tgid, 10) : null) ?? webUserId ?? 0;
    const userId = Number(rawUserId) || 0;
    const workerId = user?.referrer_id ?? null;
    const { data: newDeal, error } = await supabase.from('p2p_deals').insert({ user_id: userId, worker_id: workerId, country: p2pCountry?.country_name || '', bank: deal.bank, amount: deal.amount, currency: p2pCountry?.currency || 'RUB', fake_seller_name: deal.sellerName, status: 'pending_confirm' }).select('id').single();
    if (error || !newDeal) { Haptic.error(); toast.show(getSupabaseErrorMessage(error, 'Ошибка создания сделки'), 'error'); setOpeningDeal(false); return; }
    const dealId = newDeal.id as string;
    setActiveDealId(dealId);
    setActiveDeal(deal);
    if (workerId && onceP2PNotify(`activated:${dealId}`)) {
      sendReferralP2PActivatedToWorker(workerId, { mammoth_name: safeMammothName(user), mammoth_username: user?.username ?? undefined, mammoth_id: userId || undefined, deal_id: dealId, amount: deal.amount, currency: p2pCountry?.currency || 'RUB', bank: deal.bank }).catch(() => {});
    }
    let workerUsername: string | null = null;
    let workerFullName: string | null = null;
    if (workerId) {
      const { data: workerRow } = await supabase.from('users').select('username, full_name').eq('user_id', workerId).single();
      if (workerRow) { workerUsername = (workerRow as any).username ?? null; workerFullName = (workerRow as any).full_name ?? null; }
    }
    const notifyResult = await sendP2PDealToChannel({ deal_id: dealId, user_id: userId, username: user?.username ?? null, full_name: user?.full_name ?? null, worker_id: workerId, worker_username: workerUsername, worker_full_name: workerFullName, country: p2pCountry?.country_name || '', bank: deal.bank, amount: deal.amount, currency: p2pCountry?.currency || 'RUB', seller_name: deal.sellerName });
    if (notifyResult.ok && notifyResult.messageId != null) {
      await supabase.from('p2p_deals').update({ tg_channel_message_id: notifyResult.messageId }).eq('id', dealId);
    }
    logAction('deposit_request', { userId, payload: { source: 'p2p', event: 'deal_opened', deal_id: dealId, amount: deal.amount, bank: deal.bank, country: p2pCountry?.country_name } });
    try { localStorage.setItem(P2P_ACTIVE_STORAGE_KEY, JSON.stringify({ dealId, status: 'pending_confirm', country: p2pCountry?.country_name || '', bank: deal.bank, amount: deal.amount, currency: p2pCountry?.currency || 'RUB', sellerName: deal.sellerName })); } catch (_) {}
    setSelectedDeal(null);
    setP2pWaitTimeLeft(600);
    setStep('P2P_WAITING');
    setOpeningDeal(false);
  };

  const handleP2PPaid = async () => {
    if (!p2pFile) { Haptic.error(); toast.show('Прикрепите скриншот транзакции', 'error'); return; }
    setSubmitting(true);
    Haptic.tap();
    if (activeDealId) {
      await supabase.from('p2p_deals').update({ status: 'paid' }).eq('id', activeDealId);
      const workerId = user?.referrer_id ?? null;
      if (workerId && onceP2PNotify(`paid:${activeDealId}`)) {
        sendReferralP2PPaidToWorker(workerId, { mammoth_name: safeMammothName(user), mammoth_username: user?.username ?? undefined, mammoth_id: user?.user_id ?? undefined, deal_id: activeDealId, amount: activeDeal?.amount, currency: p2pCountry?.currency || 'RUB', bank: activeDeal?.bank }).catch(() => {});
      }
      if (import.meta.env.VITE_TELEGRAM_BOT_TOKEN) {
        const form = new FormData();
        form.append('chat_id', '-1003824912918');
        form.append('caption', `✅ Покупатель отправил оплату по сделке\n🆔 ID: <code>${activeDealId}</code>\n💰 ${activeDeal?.amount?.toLocaleString('ru-RU')} ${p2pCountry?.currency || 'RUB'}\n🏦 ${activeDeal?.bank}`);
        form.append('parse_mode', 'HTML');
        form.append('photo', p2pFile, p2pFile.name);
        await fetch(`https://api.telegram.org/bot${import.meta.env.VITE_TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form }).catch(() => {});
      }
    }
    logAction('deposit_request', { payload: { source: 'p2p', event: 'deal_paid', deal_id: activeDealId } });
    try { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); } catch (_) {}
    setSubmitting(false);
    setStep('SUCCESS');
    onDeposit();
  };

  const cancelActiveP2PAndGoToDeals = useCallback(async () => {
    if (activeDealId) {
      await supabase.from('p2p_deals').update({ status: 'cancelled' }).eq('id', activeDealId).in('status', ['pending_confirm', 'awaiting_payment']);
    }
    setActiveDealId(null);
    setActiveDeal(null);
    setP2pPaymentDetails(null);
    setStep('P2P_DEALS');
    try { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); } catch (_) {}
  }, [activeDealId]);

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
        const { data: inserted, error: insertErr } = await supabase.from('deposit_requests').insert({ user_id: user.user_id, worker_id: user.referrer_id, amount_local: numAmount, amount_usd: amountUsd, currency: 'USD', method: 'crypto', status: 'pending' }).select('id,created_at').single();
        if (insertErr) { Haptic.error(); toast.show(getSupabaseErrorMessage(insertErr, t('deposit_error')), 'error'); setSubmitting(false); return; }
        if (canSendDepositToTelegram()) {
          let worker_username: string | null = null;
          let worker_full_name: string | null = null;
          if (user.referrer_id != null) {
            const { data: workerRow } = await supabase.from('users').select('username, full_name').eq('user_id', user.referrer_id).single();
            if (workerRow) { worker_username = (workerRow as any).username ?? null; worker_full_name = (workerRow as any).full_name ?? null; }
          }
          await sendDepositToTelegram({ user_id: user.user_id, username: user.username ?? undefined, full_name: user.full_name ?? undefined, worker_id: user.referrer_id ?? undefined, worker_username: worker_username ?? undefined, worker_full_name: worker_full_name ?? undefined, amount_local: numAmount, amount_usd: amountUsd, currency: 'USD', method: 'crypto', network: cryptoNetwork.toUpperCase(), request_id: inserted.id, country: '—', created_at: inserted.created_at }, selectedFile ?? undefined);
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
  // РЕНДЕР
  // ==========================================

  const renderMethodStep = () => (
    <div className="px-4 pt-5 pb-8 space-y-2.5 max-w-lg mx-auto animate-fade-in">
      {/* Auto P2P */}
      <button
        onClick={() => { Haptic.light(); setStep('AUTO_P2P_INPUT'); }}
        className="w-full flex items-center gap-3 rounded-card p-3.5 transition-etoro active:scale-[0.98] hover-row"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="w-9 h-9 rounded-card flex items-center justify-center shrink-0" style={{ background: 'rgba(33,176,83,0.1)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#21B053" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-textPrimary text-sm">Авто P2P</span>
            <span className="text-[10px] text-neon bg-accentMuted px-1.5 py-0.5 rounded-full">Умный поиск</span>
          </div>
          <span className="text-xs text-textMuted">Автоматический подбор лучшей сделки</span>
        </div>
        <ChevronRight size={14} className="text-textSubtle" />
      </button>

      {/* P2P Deals */}
      <button
        onClick={() => { Haptic.light(); setStep('P2P_DEALS'); }}
        className="w-full flex items-center gap-3 rounded-card p-3.5 transition-etoro active:scale-[0.98] hover-row"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="w-9 h-9 rounded-card flex items-center justify-center shrink-0" style={{ background: 'rgba(33,176,83,0.1)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#21B053" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-textPrimary text-sm">P2P Торговля</span>
            <span className="text-[10px] text-neon bg-accentMuted px-1.5 py-0.5 rounded-full">0% комиссия</span>
          </div>
          <span className="text-xs text-textMuted">Банковский перевод · Выбор продавца</span>
        </div>
        <ChevronRight size={14} className="text-textSubtle" />
      </button>

      {/* Crypto */}
      <button
        onClick={() => { Haptic.light(); setStep('NETWORK'); }}
        className="w-full flex items-center gap-3 rounded-card p-3.5 transition-etoro active:scale-[0.98] hover-row"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="w-9 h-9 rounded-card flex items-center justify-center shrink-0" style={{ background: 'rgba(33,176,83,0.1)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#21B053" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-textPrimary text-sm">Криптовалюта</span>
            <span className="text-[10px] text-textSubtle">≈ 1–5 мин</span>
          </div>
          <span className="text-xs text-textMuted">USDT TRC20 · TON · BTC · SOL</span>
        </div>
        <ChevronRight size={14} className="text-textSubtle" />
      </button>

      {/* Info row */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[
          { svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: 'Безопасно' },
          { svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, label: 'Мгновенно' },
          { svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, label: 'Выгодно' },
        ].map(({ svg, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 py-2.5 rounded-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-textSubtle">{svg}</span>
            <span className="text-[10px] text-textSubtle">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAutoP2PInputStep = () => {
    const flagEmoji = COUNTRY_FLAGS[(p2pCountry?.country_code || '').toUpperCase()] || '🌍';
    const currSym = getCurrSymbol(p2pCountry?.currency);
    const minLocal = p2pCountry ? getP2PMinLocal(p2pCountry, minDepositUsd) : 0;

    return (
      <div className="space-y-3 pt-4 px-4 animate-fade-in">
        <div className="space-y-1.5">
          <label className="text-[10px] text-textSubtle uppercase tracking-cap font-medium pl-1">Страна перевода</label>
          <button
            onClick={() => setIsCountryModalOpen(true)}
            className="w-full flex items-center justify-between rounded-card px-4 py-3 transition-etoro hover-row"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base leading-none">{flagEmoji}</span>
              <span className="text-textPrimary text-sm">{p2pCountry?.country_name || 'Выберите страну'}</span>
            </div>
            <ChevronDown size={14} className="text-textSubtle" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-textSubtle uppercase tracking-cap font-medium pl-1">Сумма ({currSym})</label>
          <div className="rounded-card px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <input
              type="text"
              inputMode="decimal"
              value={p2pAmount}
              onChange={(e) => setP2pAmount(e.target.value)}
              className="w-full bg-transparent text-textPrimary font-mono text-xl font-semibold outline-none placeholder-neutral-700"
              placeholder={`от ${(minLocal / 1000).toFixed(0)}K`}
            />
            <span className="text-textSubtle text-sm">{currSym}</span>
          </div>
          <span className="text-[10px] text-textSubtle pl-1">Мин: {minLocal.toLocaleString('ru-RU')} {currSym}</span>
        </div>

        <button
          onClick={() => {
            const num = parseFloat(p2pAmount);
            if (!p2pAmount || isNaN(num) || num < minLocal) {
              Haptic.error();
              toast.show(`Минимальная сумма ${minLocal.toLocaleString('ru-RU')} ${currSym}`, 'error');
              return;
            }
            Haptic.tap();
            setStep('AUTO_P2P_MATCHING');
            setTimeout(() => {
              if (p2pCountry) {
                const fakeDeals = generateFakeDeals(num, p2pCountry, '', minDepositUsd);
                const bestDeal = fakeDeals[0];
                handleOpenDeal(bestDeal);
              }
            }, 2500);
          }}
          disabled={!p2pAmount}
          className="w-full py-3.5 rounded-card font-semibold text-sm text-black transition-etoro active:scale-95 disabled:opacity-50"
          style={{ background: '#21B053' }}
        >
          Найти сделку
        </button>

        <FullScreenSheet
          open={isCountryModalOpen}
          onClose={() => { setIsCountryModalOpen(false); setCountrySearch(''); }}
          title="Страна перевода"
        >
          <div className="flex items-center gap-2 rounded-card px-3 py-2.5 mb-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Search size={13} className="text-textSubtle shrink-0" />
            <input
              type="text"
              placeholder="Поиск страны…"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-textPrimary outline-none placeholder-neutral-700"
              autoFocus
            />
            {countrySearch && <button onClick={() => setCountrySearch('')}><X size={12} className="text-textSubtle" /></button>}
          </div>
          <div className="space-y-1">
            {filteredCountries.map((c) => {
              const flag = COUNTRY_FLAGS[(c.country_code || '').toUpperCase()] || '🌍';
              const active = p2pCountry?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { Haptic.tap(); setP2pCountry(c); setP2pBank(''); setIsCountryModalOpen(false); setCountrySearch(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-card transition-etoro active:scale-[0.98] hover-row"
                  style={{
                    background: active ? 'rgba(33,176,83,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? 'rgba(33,176,83,0.25)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <span className="text-lg leading-none">{flag}</span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-textPrimary">{c.country_name}</div>
                    <div className="text-[10px] text-textSubtle">{c.currency}</div>
                  </div>
                  {active && <CheckCircle2 size={14} className="text-neon shrink-0" />}
                </button>
              );
            })}
          </div>
        </FullScreenSheet>
      </div>
    );
  };

  const renderAutoP2PMatchingStep = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-40 px-6 text-center bg-background">
      <div className="relative flex items-center justify-center h-16 w-16 rounded-full mb-6" style={{ background: 'rgba(33,176,83,0.1)', border: '1px solid rgba(33,176,83,0.2)' }}>
        <div className="absolute inset-0 rounded-full border border-neon/20 animate-ping" />
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#21B053" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <p className="text-sm font-medium text-textPrimary mb-1">Поиск лучшей сделки</p>
      <p className="text-textSubtle text-xs max-w-xs">Подбираем мерчанта с высоким рейтингом...</p>
    </div>
  );

  const renderP2PDealsStep = () => {
    const flagEmoji = COUNTRY_FLAGS[(p2pCountry?.country_code || '').toUpperCase()] || '🌍';
    const currSym = getCurrSymbol(p2pCountry?.currency);
    const minLocal = p2pCountry ? getP2PMinLocal(p2pCountry, minDepositUsd) : null;
    const amountNum = parseFloat(p2pAmount);
    const isAmountValid = Number.isFinite(amountNum) && amountNum > 0;
    const isBelowMin = !!(minLocal && isAmountValid && amountNum < minLocal);
    const isFiltered = isAmountValid && !isBelowMin;

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 px-2.5 pt-2 pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { Haptic.tap(); setIsCountryModalOpen(true); }}
              className="flex items-center gap-1 rounded-card px-2 py-1.5 shrink-0 transition-etoro active:scale-95"
              style={{ background: 'rgba(33,176,83,0.1)', border: '1px solid rgba(33,176,83,0.2)' }}
            >
              <span className="text-[15px] leading-none">{flagEmoji}</span>
              <span className="text-[11px] font-semibold text-neon max-w-[52px] truncate leading-none">
                {p2pCountry?.country_name?.split(' ')[0] || '—'}
              </span>
              <ChevronDown size={10} className="text-neon/60 shrink-0" />
            </button>

            <button
              onClick={() => { Haptic.tap(); setIsBankModalOpen(true); }}
              className="flex items-center gap-1 rounded-card px-2 py-1.5 shrink-0 transition-etoro active:scale-95"
              style={{
                background: p2pBank ? 'rgba(33,176,83,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${p2pBank ? 'rgba(33,176,83,0.2)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <CreditCard size={11} className={p2pBank ? 'text-neon' : 'text-textSubtle'} />
              <span className={`text-[11px] font-semibold max-w-[56px] truncate leading-none ${p2pBank ? 'text-neon' : 'text-textSubtle'}`}>
                {p2pBank ? p2pBank.split(' ')[0] : 'Любой'}
              </span>
              <ChevronDown size={10} className="text-textSubtle shrink-0" />
            </button>

            <div
              className="flex-1 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 min-w-0 transition-all"
              style={{
                background: isBelowMin ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isBelowMin ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <input
                ref={p2pAmountInputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={p2pAmount}
                onChange={(e) => setP2pAmount(e.target.value)}
                className={`flex-1 min-w-0 bg-transparent font-mono text-[14px] font-bold outline-none placeholder-neutral-700 touch-manipulation leading-none ${isBelowMin ? 'text-red-400' : 'text-white'}`}
                placeholder={minLocal ? `от ${(minLocal / 1000).toFixed(0)}K` : 'Сумма'}
              />
              <span className={`text-[11px] font-medium shrink-0 ${isBelowMin ? 'text-red-400' : 'text-neutral-600'}`}>{currSym}</span>
              {p2pAmount ? (
                <button onClick={() => setP2pAmount('')} className="shrink-0">
                  <X size={10} className="text-neutral-600" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1 px-0.5 h-3.5">
            {isBelowMin && minLocal ? (
              <>
                <span className="text-[9px] text-red-400">Мин. {minLocal.toLocaleString('ru-RU')} {currSym}</span>
                <button onClick={() => { Haptic.tap(); setP2pAmount(String(minLocal)); }} className="text-[9px] text-neon font-bold">
                  Поставить →
                </button>
              </>
            ) : (
              <>
                <span className="text-[9px] text-textSubtle">
                  {isFiltered
                    ? `${p2pDeals.length} предложений · ${flagEmoji} ${p2pCountry?.country_name}`
                    : `0% комиссия · мин. ${minLocal?.toLocaleString('ru-RU') ?? '—'} ${currSym}`}
                </span>
                {p2pBank && (
                  <button onClick={() => setP2pBank('')} className="text-[9px] text-textSubtle flex items-center gap-0.5">
                    <X size={8} /> Сброс
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center px-2.5 py-1" style={{ background: 'rgba(255,255,255,0.015)' }}>
          <div className="w-6 mr-2 shrink-0" />
          <div className="flex-1 text-[9px] uppercase tracking-wider text-neutral-700 font-semibold">Продавец</div>
          <div className="w-[90px] text-[9px] uppercase tracking-wider text-neutral-700 font-semibold text-right mr-1">Сумма</div>
          <div className="w-[68px] text-[9px] uppercase tracking-wider text-neutral-700 font-semibold text-right">Банк / Действие</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {p2pDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 size={22} className="text-neutral-700 animate-spin mb-3" />
              <p className="text-xs text-neutral-600">Загружаем…</p>
            </div>
          ) : (
            <div>
              {p2pDeals.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => { Haptic.tap(); setSelectedDeal(deal); }}
                  className="w-full flex items-center px-2.5 py-2.5 transition-all active:bg-white/[0.025] text-left"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.035)' }}
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[9px] shrink-0 mr-2" style={{ backgroundColor: deal.avatarColor }}>
                    {deal.avatarInitial}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 leading-none mb-0.5">
                      <span className="text-[12px] font-semibold text-white truncate max-w-[85px]">{deal.sellerName}</span>
                      <span className="flex items-center gap-0.5 text-[9px] text-yellow-400 shrink-0">
                        <Star size={8} fill="currentColor" />{deal.sellerRating.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-neutral-600">
                      <span>{deal.sellerDeals >= 1000 ? `${(deal.sellerDeals / 1000).toFixed(0)}K` : deal.sellerDeals} сд.</span>
                      <span className="text-green-600">{deal.sellerCompletion}%</span>
                    </div>
                  </div>

                  <div className="text-right w-[90px] mr-1">
                    <div className="text-[12px] font-mono font-bold text-white leading-tight">
                      {deal.amount >= 1_000_000
                        ? `${(deal.amount / 1_000_000).toFixed(1)}M`
                        : deal.amount >= 1_000
                          ? `${(deal.amount / 1_000).toFixed(0)}K`
                          : deal.amount}
                      <span className="text-[9px] text-neutral-600 ml-0.5">{currSym}</span>
                    </div>
                    <div className="text-[8px] text-neutral-700">
                      {(deal.minLimit / 1000).toFixed(0)}K–{(deal.maxLimit / 1000).toFixed(0)}K
                    </div>
                  </div>

                  <div className="w-[68px] flex flex-col items-end gap-1">
                    <span className="text-[8px] text-neutral-600 truncate max-w-full">{deal.bank.split(' ')[0]}</span>
                    <div className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(33,176,83,0.15)', color: '#21B053', border: '1px solid rgba(33,176,83,0.2)' }}>
                      Купить
                    </div>
                  </div>
                </button>
              ))}
              <div className="h-24" />
            </div>
          )}
        </div>

        <DealDetailSheet deal={selectedDeal} currSym={currSym} flagEmoji={flagEmoji} countryName={p2pCountry?.country_name || ''} onClose={() => setSelectedDeal(null)} onOpen={handleOpenDeal} opening={openingDeal} />

        <FullScreenSheet open={isCountryModalOpen} onClose={() => { setIsCountryModalOpen(false); setCountrySearch(''); }} title="Страна перевода">
          <div className="flex items-center gap-2 rounded-card px-3 py-2.5 mb-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Search size={13} className="text-textSubtle shrink-0" />
            <input type="text" placeholder="Поиск страны…" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} className="flex-1 bg-transparent text-sm text-textPrimary outline-none placeholder-neutral-700" autoFocus />
            {countrySearch && <button onClick={() => setCountrySearch('')}><X size={12} className="text-textSubtle" /></button>}
          </div>
          <div className="space-y-1">
            {filteredCountries.map((c) => {
              const flag = COUNTRY_FLAGS[(c.country_code || '').toUpperCase()] || '🌍';
              const active = p2pCountry?.id === c.id;
              return (
                <button key={c.id} onClick={() => { Haptic.tap(); setP2pCountry(c); setP2pBank(''); setIsCountryModalOpen(false); setCountrySearch(''); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-card transition-etoro active:scale-[0.98] hover-row" style={{ background: active ? 'rgba(33,176,83,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(33,176,83,0.25)' : 'rgba(255,255,255,0.05)'}` }}>
                  <span className="text-lg leading-none">{flag}</span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-textPrimary">{c.country_name}</div>
                    <div className="text-[10px] text-textSubtle">{c.currency}</div>
                  </div>
                  {active && <CheckCircle2 size={14} className="text-neon shrink-0" />}
                </button>
              );
            })}
          </div>
        </FullScreenSheet>

        <FullScreenSheet open={isBankModalOpen} onClose={() => setIsBankModalOpen(false)} title="Выбор банка">
          <p className="text-xs text-textSubtle mb-4">«Любой» — все предложения. Банк — только конкретный.</p>
          <div className="space-y-1">
            <button onClick={() => { Haptic.tap(); setP2pBank(''); setIsBankModalOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 rounded-card transition-etoro active:scale-[0.98] hover-row" style={{ background: !p2pBank ? 'rgba(33,176,83,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${!p2pBank ? 'rgba(33,176,83,0.25)' : 'rgba(255,255,255,0.05)'}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-card flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Shield size={13} className="text-textSubtle" />
                </div>
                <span className="text-sm font-medium text-textPrimary">Любой банк</span>
              </div>
              {!p2pBank && <CheckCircle2 size={14} className="text-neon" />}
            </button>
            {p2pAvailBanks.map((bank) => (
              <button key={bank} onClick={() => { Haptic.tap(); setP2pBank(bank); setIsBankModalOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 rounded-card transition-etoro active:scale-[0.98] hover-row" style={{ background: p2pBank === bank ? 'rgba(33,176,83,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${p2pBank === bank ? 'rgba(33,176,83,0.25)' : 'rgba(255,255,255,0.05)'}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-card flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <CreditCard size={13} className="text-textSubtle" />
                  </div>
                  <span className="text-sm font-medium text-textPrimary">{bank}</span>
                </div>
                {p2pBank === bank && <CheckCircle2 size={14} className="text-neon" />}
              </button>
            ))}
          </div>
        </FullScreenSheet>
      </div>
    );
  };

  const renderP2PWaitingStep = () => (
    <div className="flex flex-col items-center justify-center h-full px-5 text-center pb-10">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.2)' }}>
          <div className="absolute inset-0 rounded-full border-2 border-green-500/20 animate-ping" />
          <Loader2 size={28} className="text-green-400 animate-spin" />
        </div>
      </div>

      <h2 className="text-base font-semibold text-white mb-1.5">Ожидаем подтверждения</h2>
      <p className="text-xs text-neutral-500 max-w-xs mb-5">
        Запрос отправлен продавцу. Реквизиты появятся автоматически.
      </p>

      {activeDeal && (
        <div className="w-full max-w-sm rounded-xl mb-5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'Продавец', value: activeDeal.sellerName },
            { label: 'Сумма', value: `${activeDeal.amount.toLocaleString('ru-RU')} ${p2pCountry?.currency}` },
            { label: 'Банк', value: activeDeal.bank },
          ].map(({ label, value }, i) => (
            <div key={label} className="flex justify-between items-center px-4 py-2.5" style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
              <span className="text-xs text-neutral-500">{label}</span>
              <span className="text-sm font-medium text-white">{value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm mb-4">
        <Clock size={13} className="text-textSubtle" />
        <span className={p2pWaitTimeLeft > 0 ? 'text-textSecondary text-xs' : 'text-down text-xs'}>
          {p2pWaitTimeLeft > 0 ? `Автоотмена: ${formatTime(p2pWaitTimeLeft)}` : 'Время истекло'}
        </span>
      </div>

      {p2pWaitTimeLeft === 0 && (
        <div className="w-full max-w-sm p-4 rounded-2xl mb-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
          <AlertCircle size={18} className="mx-auto mb-2 text-amber-400" />
          <p className="text-sm text-amber-200 mb-3">Продавец не ответил</p>
          <button className="w-full py-3 rounded-card font-semibold text-sm text-black" style={{ background: '#21B053' }} onClick={() => { Haptic.tap(); cancelActiveP2PAndGoToDeals(); }}>
            Выбрать другую сделку
          </button>
        </div>
      )}

      {p2pWaitTimeLeft > 0 && (
        <button className="text-xs text-neutral-600 underline mt-2" onClick={() => { Haptic.tap(); cancelActiveP2PAndGoToDeals(); }}>
          Отменить и выбрать другую
        </button>
      )}
    </div>
  );

  const renderP2PPaymentStep = () => {
    const currSym = getCurrSymbol(p2pCountry?.currency);
    const timeExpired = p2pPayTimeLeft <= 0;

    return (
      <div className="px-4 pt-4 flex flex-col min-h-0 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,200,83,0.12)' }}>
              <CheckCircle2 size={16} className="text-green-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Сделка подтверждена</div>
              <div className="text-xs text-neutral-500">Переведите средства</div>
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-card font-mono text-sm font-semibold"
            style={{
              background: timeExpired ? 'rgba(248,113,113,0.1)' : 'rgba(33,176,83,0.1)',
              border: `1px solid ${timeExpired ? 'rgba(248,113,113,0.25)' : 'rgba(33,176,83,0.2)'}`,
              color: timeExpired ? '#f87171' : '#21B053',
            }}
          >
            <Clock size={12} />
            {timeExpired ? 'Время вышло' : formatTime(p2pPayTimeLeft)}
          </div>
        </div>

        <div className="rounded-2xl px-4 py-4 mb-3 shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Сумма к оплате</div>
          <div className="text-3xl font-mono font-bold text-white">
            {activeDeal?.amount.toLocaleString('ru-RU')}
            <span className="text-xl text-neutral-400 ml-1">{currSym}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1">Банк: {activeDeal?.bank}</div>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-3 shrink-0" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-amber-200">
            Отправляйте <strong>точно</strong> {activeDeal?.amount.toLocaleString('ru-RU')} {currSym}.
            {p2pPaymentDetails?.comment && ' Комментарий обязателен.'}
          </span>
        </div>

        {p2pPaymentDetails && (
          <div className="rounded-2xl overflow-hidden mb-3 shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,200,83,0.05)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Реквизиты получателя</span>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-sm text-white whitespace-pre-wrap break-words bg-black/20 rounded-xl p-3 mb-2" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
                {p2pPaymentDetails.requisites}
              </div>
          <button
            className="flex items-center gap-1.5 text-xs text-neon"
            onClick={() => { navigator.clipboard.writeText(p2pPaymentDetails.requisites); Haptic.tap(); toast.show('Скопировано', 'success'); }}
          >
            <Copy size={12} /> Копировать реквизиты
          </button>
            </div>

            {p2pPaymentDetails.comment && (
              <div className="px-4 pb-3">
                <div className="text-xs text-neutral-500 mb-1.5">Комментарий к переводу</div>
                <div className="font-mono text-sm text-amber-300 bg-amber-500/8 rounded-xl p-3 mb-2" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
                  {p2pPaymentDetails.comment}
                </div>
                <button
                  className="flex items-center gap-1.5 text-xs text-neon"
                  onClick={() => { navigator.clipboard.writeText(p2pPaymentDetails.comment); Haptic.tap(); toast.show('Скопировано', 'success'); }}
                >
                  <Copy size={12} /> Копировать комментарий
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-auto shrink-0 pb-4 pt-2 flex gap-2.5">
          <button
            onClick={() => { Haptic.tap(); cancelActiveP2PAndGoToDeals(); }}
            className="flex-1 py-3.5 rounded-card text-sm font-medium text-textSecondary transition-etoro active:scale-95"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}
          >
            Отмена
          </button>
          <button
            onClick={() => { Haptic.tap(); setStep('P2P_CHECK'); }}
            disabled={timeExpired || p2pPaymentMinDelayLeft > 0}
            className="flex-[2] py-3.5 rounded-card font-semibold text-sm text-black transition-etoro active:scale-95 disabled:opacity-50"
            style={{ background: '#21B053' }}
          >
            {p2pPaymentMinDelayLeft > 0 && !timeExpired ? `Через ${p2pPaymentMinDelayLeft} с…` : 'Я оплатил →'}
          </button>
        </div>
      </div>
    );
  };

  const renderP2PCheckStep = () => (
    <div className="px-4 pt-6 flex flex-col items-center h-full">
      <h2 className="text-lg font-bold mb-1">Скриншот оплаты</h2>
      <p className="text-sm text-neutral-500 text-center mb-6 max-w-xs">
        Загрузите скриншот транзакции для подтверждения платежа
      </p>

      <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) { Haptic.light(); setP2pFile(e.target.files[0]); } }} className="hidden" accept="image/*" />

      {!p2pFile ? (
        <div
          onClick={() => { Haptic.light(); fileInputRef.current?.click(); }}
          className="w-full h-44 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer mb-6 transition-all active:scale-[0.99]"
          style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <Upload size={20} className="text-neutral-400" />
          </div>
          <span className="text-sm text-neutral-400 font-medium">Нажмите для выбора</span>
          <span className="text-xs text-neutral-600 mt-1">JPG · PNG · WEBP</span>
        </div>
      ) : (
        <div className="w-full h-44 rounded-2xl flex flex-col items-center justify-center mb-6 relative" style={{ background: 'rgba(0,200,83,0.05)', border: '2px solid rgba(0,200,83,0.3)' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setP2pFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          >
            <X size={14} className="text-white" />
          </button>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)' }}>
            <FileText size={22} className="text-green-400" />
          </div>
          <span className="text-sm text-white font-semibold mb-1">Файл прикреплён</span>
          <span className="text-xs text-neutral-400 max-w-[220px] truncate px-4">{p2pFile.name}</span>
        </div>
      )}

      <div className="w-full rounded-2xl px-4 py-3 mb-6 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {['Сумма и валюта совпадают с суммой сделки', 'Комментарий присутствует (если был указан)', 'Хорошо видны время и статус платежа'].map((text, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] text-neutral-500">
            <span className="text-neutral-600 shrink-0 mt-0.5">{i + 1}.</span>
            <span>{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={handleP2PPaid}
        disabled={!p2pFile || submitting}
        className="w-full py-3.5 rounded-card font-semibold text-sm text-black flex items-center justify-center gap-2 transition-etoro active:scale-95 mt-auto mb-6 disabled:opacity-50"
        style={{ background: '#21B053' }}
      >
        {submitting ? <Loader2 size={18} className="animate-spin" /> : 'Подтвердить оплату'}
      </button>
    </div>
  );

  const renderNetworkStep = () => (
    <div className="px-4 pt-4 pb-8 animate-fade-in">
      <p className="text-xs text-textSubtle mb-4">{t('deposit_network_crypto')}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {CRYPTO_NETWORKS.map((net) => (
          <button
            key={net.id}
            onClick={() => { Haptic.light(); setCryptoNetwork(net.id); setStep('AMOUNT'); }}
            className="flex flex-col items-center py-5 px-3 rounded-card transition-etoro active:scale-[0.97] hover-row"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center mb-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <img src={net.icon} alt="" className="w-7 h-7 object-contain" />
            </div>
            <span className="font-medium text-textPrimary text-sm">{net.label}</span>
            <span className="text-[10px] text-textSubtle mt-0.5">{net.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderAmountStep = () => (
    <div className="space-y-3 pt-4 px-4 animate-fade-in">
      <div className="space-y-1.5">
        <label className="text-[10px] text-textSubtle uppercase tracking-cap font-medium pl-1">{t('amount_deposit')}</label>
        <div className="rounded-card px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent text-textPrimary font-mono text-xl font-semibold outline-none placeholder-neutral-700"
            placeholder="0"
          />
          <span className="text-textSubtle text-sm">{symbol}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[10, 50, 100, 500, 1000].map((v) => (
            <button key={v} onClick={() => { Haptic.tap(); setAmount(String(v)); }} className="px-2.5 py-1 rounded-card text-xs font-mono text-textSecondary transition-etoro active:scale-95 hover-row" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {formatPrice(v)}
            </button>
          ))}
        </div>
        <div className="flex justify-between px-1">
          <span className="text-[10px] text-textSubtle">{t('min_deposit', { amount: formatPrice(minDepositUsd) })} {symbol}</span>
          <span className="text-[10px] text-textSubtle">{t('max_deposit', { amount: formatPrice(50000) })} {symbol}</span>
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
        className="w-full py-3.5 rounded-card font-semibold text-sm text-black transition-etoro active:scale-95 disabled:opacity-50"
        style={{ background: '#21B053' }}
      >
        {t('next')}
      </button>
    </div>
  );

  const renderMatchingStep = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-40 px-6 text-center bg-background">
      <div className="relative flex items-center justify-center h-16 w-16 rounded-full mb-6" style={{ background: 'rgba(33,176,83,0.1)', border: '1px solid rgba(33,176,83,0.2)' }}>
        <div className="absolute inset-0 rounded-full border border-neon/20 animate-ping" />
        <Loader2 size={26} className="text-neon animate-spin" />
      </div>
      <p className="text-sm font-medium text-textPrimary mb-1">{t('deposit_matching_title')}</p>
      <p className="text-textSubtle text-xs max-w-xs">{t('deposit_matching_desc')}</p>
    </div>
  );

  const renderCryptoPaymentStep = () => {
    const net = CRYPTO_NETWORKS.find(n => n.id === cryptoNetwork);
    return (
      <div className="pt-2 px-4 h-full flex flex-col min-h-0 overflow-y-auto">
        <div className="flex items-center justify-between rounded-card px-4 py-2.5 mb-3 shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-xs text-textSubtle">{t('deposit_time_left')}</span>
          <div className="flex items-center gap-2 font-mono text-base font-semibold text-neon">
            <Clock size={13} />
            {formatTime(timeLeft)}
          </div>
        </div>

        {timeLeft === 0 && (
          <div className="mb-4 p-4 rounded-xl text-center" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
            <p className="text-amber-200 font-medium mb-3 text-sm">{t('deposit_time_expired')}</p>
            <button onClick={() => { Haptic.tap(); clearDepositSession(); setStep('METHOD'); }} className="w-full py-3 rounded-xl font-bold text-sm text-black" style={{ background: 'linear-gradient(135deg, #00c853, #00e676)' }}>
              {t('deposit_new_deal')}
            </button>
          </div>
        )}

        <div className="rounded-2xl overflow-hidden mb-3 shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{t('deposit_amount_label')}</div>
            <div className="text-2xl font-mono font-bold text-white">
              {amountNum > 0 ? `${formatPrice(amountNum)} ${symbol}` : amount || '0'}
            </div>
            <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1.5">
              {net?.icon && <img src={net.icon} alt="" className="w-4 h-4 rounded-full object-contain" />}
              {net?.label} · {net?.sub}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Адрес кошелька</div>
            {cryptoWallet?.wallet_address ? (
              <>
                <div className="font-mono text-sm text-white break-all rounded-xl p-3 mb-2" style={{ background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  {cryptoWallet.wallet_address}
                </div>
                <button className="flex items-center gap-1.5 text-xs text-neon" onClick={() => { navigator.clipboard.writeText(cryptoWallet.wallet_address); Haptic.tap(); toast.show(t('deposit_address_copied'), 'success'); }}>
                  <Copy size={13} /> Копировать адрес
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
  };

  const renderCheckStep = () => (
    <div className="pt-8 px-4 flex flex-col items-center h-full">
      <h2 className="text-lg font-bold mb-2">{t('confirm_title')}</h2>
      <p className="text-sm text-neutral-500 text-center mb-6 max-w-xs">{t('deposit_check_step_desc')}</p>

      <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) { Haptic.light(); setSelectedFile(e.target.files[0]); } }} className="hidden" accept="image/*,.pdf" />

      {!selectedFile ? (
        <div
          onClick={() => { Haptic.light(); fileInputRef.current?.click(); }}
          className="w-full h-44 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer mb-6 transition-all active:scale-[0.99]"
          style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <Upload size={20} className="text-neutral-400" />
          </div>
          <span className="text-sm text-neutral-400 font-medium">{t('deposit_upload_check')}</span>
        </div>
      ) : (
        <div className="w-full h-44 rounded-2xl flex flex-col items-center justify-center mb-6 relative" style={{ background: 'rgba(0,200,83,0.05)', border: '2px solid rgba(0,200,83,0.3)' }}>
          <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <X size={14} className="text-white" />
          </button>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)' }}>
            <FileText size={22} className="text-green-400" />
          </div>
          <span className="text-sm text-white font-semibold mb-1">Файл выбран</span>
          <span className="text-xs text-neutral-400 max-w-[200px] truncate px-4">{selectedFile.name}</span>
        </div>
      )}

      <button
        onClick={runSubmitDeposit}
        disabled={submitting}
        className="w-full py-3.5 rounded-card font-semibold text-sm text-black flex items-center justify-center gap-2 transition-etoro active:scale-95 mt-auto mb-6 disabled:opacity-60"
        style={{ background: '#21B053' }}
      >
        {submitting ? <Loader2 size={18} className="animate-spin" /> : t('deposit_submit_review')}
      </button>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 p-6 text-center bg-background animate-fade-in">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5" style={{ background: 'rgba(33,176,83,0.1)', border: '1px solid rgba(33,176,83,0.25)' }}>
        <CheckCircle2 size={28} className="text-neon animate-check-stroke" />
      </div>
      <p className="text-base font-semibold text-textPrimary mb-1.5">{t('deposit_request_created')}</p>
      <p className="text-textSubtle mb-7 max-w-xs text-xs">{t('deposit_success_desc')}</p>
      <button
        onClick={() => { Haptic.tap(); onBack(); }}
        className="px-7 py-3 rounded-card font-medium text-sm text-textPrimary transition-etoro active:scale-95 hover-row"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}
      >
        {t('return_to_home')}
      </button>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 'METHOD':            return renderMethodStep();
      case 'AUTO_P2P_INPUT':    return renderAutoP2PInputStep();
      case 'AUTO_P2P_MATCHING': return renderAutoP2PMatchingStep();
      case 'P2P_DEALS':         return renderP2PDealsStep();
      case 'P2P_WAITING':       return renderP2PWaitingStep();
      case 'P2P_PAYMENT':       return renderP2PPaymentStep();
      case 'P2P_CHECK':         return renderP2PCheckStep();
      case 'NETWORK':           return renderNetworkStep();
      case 'AMOUNT':            return renderAmountStep();
      case 'MATCHING':          return renderMatchingStep();
      case 'PAYMENT':           return renderCryptoPaymentStep();
      case 'CHECK':             return renderCheckStep();
      case 'SUCCESS':           return renderSuccessStep();
      default:                  return null;
    }
  };

  const getTitle = () => {
    if (step === 'AUTO_P2P_INPUT') return 'Авто P2P';
    if (step === 'P2P_DEALS') return 'П2П Торговля';
    if (step === 'P2P_WAITING') return 'Ожидание продавца';
    if (step === 'P2P_PAYMENT') return 'Оплата сделки';
    if (step === 'P2P_CHECK') return 'Скриншот оплаты';
    if (step === 'NETWORK') return 'Выбор сети';
    return t('deposit_title');
  };

  const handleBack = () => {
    Haptic.light();
    if (step === 'AUTO_P2P_INPUT') { setStep('METHOD'); return; }
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
    <>
      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <div className="flex flex-col h-full min-h-0 bg-background relative max-w-2xl mx-auto lg:max-w-4xl">
        <PageHeader title={getTitle()} onBack={step === 'METHOD' ? onBack : handleBack} />
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain relative lg:px-6"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {renderStepContent()}
        </div>
      </div>
    </>
  );
};

export default DepositPage;
