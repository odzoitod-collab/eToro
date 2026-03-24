import React from 'react';

export type AssetCategory = 'crypto' | 'stock' | 'commodity' | 'forex';

export interface Asset {
  id: string;
  ticker: string;
  name: string;
  price: number;
  volume24h: number; // In RUB
  change24h: number; // Percentage
  isNew?: boolean;
  /**
   * Тип актива: криптовалюта, акция, сырьё или валютная пара (Forex).
   * Если не указан, по умолчанию считаем crypto.
   */
  category?: AssetCategory;
  /** Явный символ TradingView (например FX_IDC:EURUSD). Если не задан — выводится из ticker и category. */
  tradingViewSymbol?: string;
  /** true, если цену не удалось получить (например, CORS для Yahoo Finance) — в UI показывать "—". */
  priceUnavailable?: boolean;
}

export type PageView =
  | 'HOME'
  | 'COINS'
  | 'TRADING'
  | 'STAKING'
  | 'DEALS'
  | 'EXCHANGE'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'QR_SCANNER'
  | 'PROFILE'
  | 'KYC'
  | 'CURRENCY'
  | 'LANGUAGE'
  | 'SUPPORT';

export interface NavItem {
  id: PageView;
  label: string;
  icon: React.FC<any>;
}

export type DealStatus = 'ACTIVE' | 'WIN' | 'LOSS';
export type DealSide = 'UP' | 'DOWN';

export interface Deal {
    id: string;
    assetTicker: string;
    side: DealSide;
    amount: number;
    leverage: number;
    entryPrice: number;
    currentPrice?: number; // Dynamic price for active deals
    startTime: number;
    durationSeconds: number; // in seconds
    status: DealStatus;
    pnl?: number; // Profit and Loss
}

/** Спотовая позиция: купленный актив (количество + средняя цена в рублях). */
export interface SpotHolding {
  ticker: string;
  amount: number;
  avgPriceRub: number;
}

/** Ставка стейкинга по монете (доходность в месяц, доля: 0.13 = 13%). */
export interface StakingRate {
  ticker: string;
  ratePerMonth: number;
}

/** Позиция стейкинга: объём в стейке + накопленные проценты. */
export interface StakingPosition {
  ticker: string;
  amount: number;
  rewardsAccrued: number;
  stakedAt: string;
  lastAccrualTs: string;
}

/** Запись истории операций (покупка/продажа спот, стейкинг, вывод, сделка) — из БД. */
export type ActivityType = 'spot_buy' | 'spot_sell' | 'stake' | 'unstake' | 'trade' | 'staking_reward';

export interface ActivityHistoryItem {
  id: number;
  activity_type: ActivityType;
  ticker: string | null;
  quantity: number | null;
  amount_rub: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}