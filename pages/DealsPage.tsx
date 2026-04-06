import React, { useState, useEffect } from 'react';
import { Deal } from '../types';
import type { SpotHolding, StakingPosition, ActivityHistoryItem } from '../types';
import type { Asset } from '../types';
import {
  Timer,
  Wallet,
  History,
  BarChart3,
  ArrowLeftRight,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import Skeleton from '../components/Skeleton';
import { Haptic } from '../utils/haptics';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { MARKET_ASSETS } from '../constants';
import { useLiveAssets } from '../utils/useLiveAssets';
import { fetchActivityHistory } from '../lib/activityHistory';

interface DealsPageProps {
  deals: Deal[];
  spotHoldings: SpotHolding[];
  stakingPositions?: StakingPosition[];
  userId: number;
  onNavigateToTrading: (asset: Asset, options?: { tradeType?: 'futures' | 'spot'; spotAction?: 'buy' | 'sell' }) => void;
  onNavigateToExchange?: () => void;
}

type TabId = 'ACTIVE' | 'HISTORY' | 'ASSETS';

const DealsPage: React.FC<DealsPageProps> = ({
  deals,
  spotHoldings,
  stakingPositions = [],
  userId,
  onNavigateToTrading,
  onNavigateToExchange,
}) => {
  const { formatPrice, symbol } = useCurrency();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('ACTIVE');
  const [now, setNow] = useState(Date.now());
  const [activityHistory, setActivityHistory] = useState<ActivityHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const liveAssets = useLiveAssets(MARKET_ASSETS);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab !== 'HISTORY' || userId <= 0) return;
    setHistoryLoading(true);
    fetchActivityHistory(userId).then((list) => {
      setActivityHistory(list);
      setHistoryLoading(false);
    });
  }, [activeTab, userId]);

  const activeDeals = deals.filter((d) => d.status === 'ACTIVE').sort((a, b) => b.startTime - a.startTime);
  const totalActiveExposure = activeDeals.reduce((sum, d) => sum + d.amount, 0);
  const totalPnlActive = activeDeals.reduce((sum, d) => sum + (d.pnl ?? 0), 0);

  const formatTimeLeft = (deal: Deal) => {
    const endTime = deal.startTime + deal.durationSeconds * 1000;
    const left = Math.max(0, endTime - now);
    const seconds = Math.floor((left / 1000) % 60);
    const minutes = Math.floor(left / 1000 / 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatHistoryDate = (createdAt: string) => {
    const d = new Date(createdAt);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'ACTIVE', label: t('active_tab'), count: activeDeals.length },
    { id: 'HISTORY', label: t('history_tab'), count: activityHistory.length },
    { id: 'ASSETS', label: t('my_assets'), count: spotHoldings.length },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in">
      {/* Шапка: заголовок + сводка */}
      <header className="shrink-0 px-4 pt-4 pb-3 border-b border-border bg-background min-h-[48px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center text-neon">
              <BarChart3 size={18} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-base font-bold text-textPrimary tracking-tight">{t('portfolio_title')}</h1>
              <p className="text-[11px] text-textMuted mt-0.5">
                {activeDeals.length > 0
                  ? `${activeDeals.length} ${t('active_tab').toLowerCase()} · ${formatPrice(totalActiveExposure)} ${symbol}`
                  : t('history_tab')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {activeDeals.length > 0 && (
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-wider text-textMuted">P&L</p>
                <p
                  className={`text-xs font-mono font-bold ${
                    totalPnlActive >= 0 ? 'text-up' : 'text-down'
                  }`}
                >
                  {totalPnlActive >= 0 ? '+' : ''}
                  {formatPrice(totalPnlActive)} {symbol}
                </p>
              </div>
            )}
            {onNavigateToExchange && (
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  onNavigateToExchange();
                }}
                className="min-h-[28px] px-2 rounded-lg bg-neon/20 text-neon border border-neon/40 text-[10px] font-bold hover:bg-neon/30 active:scale-[0.98] transition-all flex items-center gap-1"
              >
                <ArrowLeftRight size={11} />
                {t('exchange_title')}
              </button>
            )}
          </div>
        </div>

        {/* Табы в стиле биржи */}
        <div className="flex gap-1 mt-4 p-1 rounded-xl bg-surface border border-border">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                Haptic.tap();
                setActiveTab(id);
              }}
              className={`flex-1 py-2.5 px-2 text-xs font-medium rounded-lg transition-all duration-200 active:scale-[0.98] ${
                activeTab === id
                  ? 'bg-card text-textPrimary border border-border shadow-sm'
                  : 'text-textMuted hover:text-textSecondary border border-transparent'
              }`}
            >
              <span className="block truncate">{label}</span>
              <span className="block text-[10px] font-mono mt-0.5 opacity-80">{count}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Контент */}
      <div className="flex-1 overflow-y-auto overflow-x-auto no-scrollbar pb-24">
        {/* ——— Активные сделки ——— */}
        {activeTab === 'ACTIVE' && (
          <div className="px-4 py-3">
            {activeDeals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center">
                  <Timer size={32} className="text-textMuted opacity-70" />
                </div>
                <p className="text-sm font-medium text-textPrimary">{t('no_open_positions')}</p>
                <p className="text-xs text-textMuted max-w-[260px]">
                  Откройте сделку на вкладке «Торговля» — здесь появятся позиции и P&L в реальном времени.
                </p>
              </div>
            )}

            {activeDeals.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Заголовки колонок */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-3 py-2 border-b border-border bg-surface/80 text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                  <span>Пара / Направление</span>
                  <span className="text-right">Вход</span>
                  <span className="text-right">P&L</span>
                  <span className="text-right">Закрытие</span>
                </div>
                {activeDeals.map((deal) => {
                  const isProfitable = (deal.pnl ?? 0) >= 0;
                  const priceDiff = (deal.currentPrice ?? deal.entryPrice) - deal.entryPrice;
                  const pricePercent = deal.entryPrice ? (priceDiff / deal.entryPrice) * 100 : 0;
                  return (
                    <div
                      key={deal.id}
                      className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-3 py-2.5 border-b border-border last:border-b-0 hover-row items-center min-h-[56px] ${
                        isProfitable ? 'border-l-2 border-l-up' : 'border-l-2 border-l-down'
                      }`}
                    >
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-textPrimary truncate">{deal.assetTicker}</span>
                          <span className="shrink-0 text-[10px] font-mono text-textMuted bg-surface px-1.5 py-0.5 rounded border border-border">
                            x{deal.leverage}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {deal.side === 'UP' ? (
                            <ArrowUpRight size={12} className="text-up shrink-0" />
                          ) : (
                            <ArrowDownRight size={12} className="text-down shrink-0" />
                          )}
                          <span className={`text-[11px] font-medium ${deal.side === 'UP' ? 'text-up' : 'text-down'}`}>
                            {deal.side === 'UP' ? t('up') : t('down')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-textSecondary block">
                          {formatPrice(deal.entryPrice)}
                        </span>
                        <span className="text-[10px] text-textMuted">
                          {pricePercent >= 0 ? '+' : ''}
                          {pricePercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-mono font-bold ${isProfitable ? 'text-up' : 'text-down'}`}>
                          {isProfitable ? '+' : ''}
                          {formatPrice(deal.pnl ?? 0)}
                        </span>
                        <span className="text-[10px] text-textMuted block">{symbol}</span>
                      </div>
                      <div className="text-right">
                        {deal.durationSeconds === 0 ? (
                          <span className="text-xs text-textMuted font-medium">Ручное<br/>закрытие</span>
                        ) : (
                          <>
                            <span className="text-sm font-mono font-bold text-textPrimary tabular-nums">
                              {formatTimeLeft(deal)}
                            </span>
                            <span className="text-[10px] text-textMuted block">{t('left')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ——— История операций ——— */}
        {activeTab === 'HISTORY' && (
          <div className="px-4 py-3">
            {historyLoading && (
              <div className="rounded-xl bg-card overflow-hidden">
                {Array.from({ length: 3 }).map((_, idx) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Skeleton key={idx} className="w-full h-14 bg-neutral-900/60" />
                ))}
              </div>
            )}

            {!historyLoading && activityHistory.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
                  <History size={32} className="text-textMuted opacity-70" />
                </div>
                <p className="text-sm font-medium text-textPrimary">{t('history_empty')}</p>
                <p className="text-xs text-textMuted mt-1">Здесь появятся сделки, спот и стейкинг.</p>
              </div>
            )}

            {!historyLoading && activityHistory.length > 0 && (
              <div className="rounded-xl bg-card overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 border-b border-border bg-surface/80 text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                  <span>Операция / Актив</span>
                  <span className="text-right">Сумма</span>
                </div>
                {activityHistory.map((item) => {
                  const labelMap: Record<ActivityHistoryItem['activity_type'], string> = {
                    spot_buy: t('spot_buy'),
                    spot_sell: t('spot_sell'),
                    stake: t('stake_btn'),
                    unstake: t('unstake_btn'),
                    trade: t('history_trade'),
                    staking_reward: t('staking_reward_history'),
                  };
                  const label = labelMap[item.activity_type];
                  const isGreen =
                    item.activity_type === 'spot_buy' ||
                    item.activity_type === 'stake' ||
                    item.activity_type === 'staking_reward' ||
                    (item.activity_type === 'trade' && (item.amount_rub ?? 0) >= 0);
                  const isRed =
                    item.activity_type === 'spot_sell' ||
                    item.activity_type === 'unstake' ||
                    (item.activity_type === 'trade' && (item.amount_rub ?? 0) < 0);
                  const ticker = item.ticker || (item.payload?.symbol as string) || '—';
                  const amountRub = item.amount_rub ?? 0;
                  const quantity = item.quantity ?? 0;
                  const payload = item.payload as { type?: string; leverage?: number } | undefined;
                  return (
                    <div
                      key={`${item.id}-${item.created_at}`}
                      className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2.5 border-b border-border last:border-b-0 hover-row items-center min-h-[56px]"
                    >
                      <div className="min-w-0">
                        <p className={`text-xs font-medium ${isGreen ? 'text-up' : isRed ? 'text-down' : 'text-textSecondary'}`}>
                          {label}
                        </p>
                        <p className="font-mono text-sm font-semibold text-textPrimary truncate">{ticker}</p>
                        {(payload?.type || payload?.leverage) && (
                          <p className="text-[10px] text-textMuted mt-0.5">
                            {payload?.type ?? ''} · x{payload?.leverage ?? 1}
                          </p>
                        )}
                        {quantity > 0 && (
                          <p className="text-[10px] text-textMuted font-mono">{quantity.toFixed(6)}</p>
                        )}
                        <p className="text-[10px] text-textMuted mt-0.5">{formatHistoryDate(item.created_at)}</p>
                      </div>
                      <div className="text-right">
                        {item.activity_type === 'trade' && (
                          <span className={`font-mono text-sm font-bold tabular-nums ${amountRub >= 0 ? 'text-up' : 'text-down'}`}>
                            {amountRub >= 0 ? '+' : ''}
                            {formatPrice(amountRub)} {symbol}
                          </span>
                        )}
                        {(item.activity_type === 'spot_buy' || item.activity_type === 'spot_sell') && (
                          <span className="font-mono text-sm text-textPrimary">{formatPrice(amountRub)} {symbol}</span>
                        )}
                        {item.activity_type === 'stake' && (
                          <span className="font-mono text-sm text-neon">−{formatPrice(amountRub)} {symbol}</span>
                        )}
                        {(item.activity_type === 'unstake' || item.activity_type === 'staking_reward') && (
                          <span className="font-mono text-sm text-up">+{formatPrice(amountRub)} {symbol}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ——— Мои активы (спот) ——— */}
        {activeTab === 'ASSETS' && (
          <div className="px-4 py-3">
            {spotHoldings.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
                  <Wallet size={32} className="text-textMuted opacity-70" />
                </div>
                <p className="text-sm font-medium text-textPrimary">{t('no_spot_assets')}</p>
                <p className="text-xs text-textMuted mt-1">Купите актив на спот — он появится здесь.</p>
              </div>
            )}

            {spotHoldings.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2 border-b border-border bg-surface/80 text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                  <span>Актив</span>
                  <span className="text-right">Объём / Стоимость</span>
                  <span className="text-right w-16">{t('sell')}</span>
                </div>
                {spotHoldings.map((holding) => {
                  const asset =
                    MARKET_ASSETS.find((a) => a.ticker === holding.ticker) ||
                    ({
                      id: holding.ticker,
                      ticker: holding.ticker,
                      name: holding.ticker,
                      price: holding.avgPriceRub,
                      volume24h: 0,
                      change24h: 0,
                    } as Asset);
                  const valueRub = holding.amount * holding.avgPriceRub;
                  return (
                    <div
                      key={holding.ticker}
                      className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2.5 border-b border-border last:border-b-0 hover-row items-center min-h-[56px]"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-textPrimary">{holding.ticker}</p>
                        <p className="text-[10px] text-textMuted font-mono">
                          {holding.amount.toFixed(8)} × {formatPrice(holding.avgPriceRub)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-textPrimary">{formatPrice(valueRub)} {symbol}</p>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            Haptic.tap();
                            onNavigateToTrading(asset, { tradeType: 'spot', spotAction: 'sell' });
                          }}
                          className="touch-target min-h-[36px] px-3 rounded-xl bg-neon/20 text-neon border border-neon/40 text-xs font-bold hover:bg-neon/30 active:scale-[0.98] transition-all flex items-center gap-1"
                        >
                          {t('sell')}
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DealsPage;
