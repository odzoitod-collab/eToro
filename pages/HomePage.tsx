import React, { useRef, useEffect, useState } from 'react';
import HomeHeader from '../components/HomeHeader';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import BalanceDisplay from '../components/BalanceDisplay';
import QuickActions from '../components/QuickActions';
import PopularPairs from '../components/PopularPairs';
import MarketTicker from '../components/MarketTicker';
import AssetTable from '../components/AssetTable';
import Skeleton from '../components/Skeleton';
import { MOCK_ASSETS } from '../constants';
import { Asset, PageView } from '../types';
import { useLiveAssets } from '../utils/useLiveAssets';
import { Clock, ArrowRight } from 'lucide-react';
import { Haptic } from '../utils/haptics';

interface HomePageProps {
    balance: number;
    user: import('../context/UserContext').DbUser | null;
    onNavigateToTrading: (asset: Asset) => void;
    onSearch: () => void;
    onNavigate: (page: PageView) => void;
    onCurrencyClick?: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ balance, user, onNavigateToTrading, onSearch, onNavigate, onCurrencyClick }) => {
  const { convertFromRub, symbol } = useCurrency();
  const { t } = useLanguage();
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const balanceRef = useRef<HTMLDivElement>(null);
  const liveAssets = useLiveAssets(MOCK_ASSETS);
  const [p2pBanner, setP2pBanner] = useState<{
    amount: number;
    currency: string;
    bank: string;
    status: 'waiting' | 'payment';
    timeLeft?: number;
  } | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // If entry is NOT intersecting (ratio 0), it means it's out of view
        setIsBalanceHidden(!entry.isIntersecting);
      },
      {
        root: null, // viewport
        threshold: 0.2, // Trigger when 20% of the element is visible (mostly scrolled out)
      }
    );

    if (balanceRef.current) {
      observer.observe(balanceRef.current);
    }

    return () => {
      if (balanceRef.current) {
        observer.unobserve(balanceRef.current);
      }
    };
  }, []);

  // П2П баннер «открытая сделка» + таймер
  useEffect(() => {
    const STORAGE_KEY = 'etoro_active_p2p_deal';

    const readFromStorage = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setP2pBanner(null);
          return;
        }
        const stored = JSON.parse(raw) as {
          amount?: number;
          currency?: string;
          bank?: string;
          status?: string;
          paymentDeadline?: number;
        };
        const amount = Number(stored.amount || 0);
        const currency = stored.currency || 'RUB';
        const bank = stored.bank || 'Банк';
        if (!amount) {
          setP2pBanner(null);
          return;
        }
        if (stored.status === 'awaiting_payment' && stored.paymentDeadline) {
          const now = Date.now();
          const left = Math.max(0, Math.floor((stored.paymentDeadline - now) / 1000));
          setP2pBanner({
            amount,
            currency,
            bank,
            status: 'payment',
            timeLeft: left,
          });
        } else {
          setP2pBanner({
            amount,
            currency,
            bank,
            status: 'waiting',
          });
        }
      } catch {
        setP2pBanner(null);
      }
    };

    readFromStorage();
    const id = window.setInterval(() => {
      readFromStorage();
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatTime = (seconds: number | undefined) => {
    if (seconds == null) return '--:--';
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in px-4 lg:px-6 lg:max-w-4xl mx-auto space-y-6">
      <HomeHeader 
        showBalanceTitle={isBalanceHidden} 
        balance={balance} 
        user={user}
        onSearch={onSearch}
        onProfileClick={() => onNavigate('PROFILE')}
      />
      
      <div ref={balanceRef} className="opacity-100 transition-opacity duration-300 min-h-[88px] flex items-center justify-center">
        {Number.isNaN(balance) ? (
          <Skeleton className="w-40 h-8" />
        ) : (
          <BalanceDisplay balance={balance} onCurrencyClick={onCurrencyClick} />
        )}
      </div>

      {p2pBanner && (
        <button
          type="button"
          onClick={() => {
            Haptic.tap();
            onNavigate('DEPOSIT');
          }}
          className="w-full rounded-2xl bg-neon/8 border border-neon/40 px-3.5 py-2 flex items-center justify-between gap-3 shadow-[0_0_18px_rgba(0,255,170,0.25)] active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-neon animate-pulse shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-neon font-semibold uppercase tracking-wide">
                Открытая П2П-сделка
              </span>
              <span className="text-[11px] text-neutral-300 truncate">
                {p2pBanner.amount.toLocaleString('ru-RU')} {p2pBanner.currency} · {p2pBanner.bank}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {p2pBanner.status === 'payment' ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 border border-neutral-700 text-[11px] text-neutral-200 font-mono">
                <Clock size={11} className="text-neon" />
                {formatTime(p2pBanner.timeLeft)}
              </span>
            ) : (
              <span className="text-[11px] text-neutral-400">Ожидание продавца</span>
            )}
            <ArrowRight size={14} className="text-neon" />
          </div>
        </button>
      )}

      <QuickActions onNavigate={onNavigate} />

      <PopularPairs assets={liveAssets} onAssetClick={onNavigateToTrading} />

      <div className="px-0 mt-2 flex items-center justify-between text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          {t('all_systems_ok')}
        </span>
        <span className="font-mono">{t('vol_24h')}: {(convertFromRub(12.4e9) / 1e9).toFixed(1)} {symbol}</span>
      </div>

      <div className="mt-3">
        <MarketTicker />
      </div>
      
      <div className="mt-4 flex-1 pb-28 lg:pb-12">
        {liveAssets.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={idx} className="w-full h-14 rounded-lg bg-card/60" />
            ))}
          </div>
        ) : (
          <AssetTable assets={liveAssets} onAssetClick={onNavigateToTrading} />
        )}
      </div>
    </div>
  );
};

export default HomePage;