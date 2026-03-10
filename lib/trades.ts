import { Deal, DealStatus } from '../types';

export interface TradeRow {
  id: string;
  user_id: number;
  pair: string;
  symbol: string;
  type: 'Long' | 'Short';
  amount: number;
  leverage: number | null;
  entry_price: number;
  final_price: number | null;
  start_time: number;
  duration_seconds: number;
  status: 'active' | 'completed' | 'cancelled';
  final_pnl: number | null;
  is_winning: boolean | null;
  created_at?: string;
}

export function tradeRowToDeal(row: TradeRow): Deal {
  const status: DealStatus =
    row.status === 'active'
      ? 'ACTIVE'
      : row.is_winning === true
        ? 'WIN'
        : 'LOSS';
  return {
    id: row.id,
    assetTicker: row.symbol,
    side: row.type === 'Long' ? 'UP' : 'DOWN',
    amount: row.amount,
    leverage: row.leverage ?? 1,
    entryPrice: row.entry_price,
    currentPrice: row.final_price ?? undefined,
    startTime: row.start_time,
    durationSeconds: row.duration_seconds,
    status,
    pnl: row.final_pnl ?? undefined,
  };
}

export function dealToTradeInsert(deal: Deal, userId: number) {
  return {
    user_id: userId,
    pair: deal.assetTicker,
    symbol: deal.assetTicker,
    type: deal.side === 'UP' ? 'Long' : 'Short',
    amount: deal.amount,
    leverage: deal.leverage,
    entry_price: deal.entryPrice,
    start_time: deal.startTime,
    duration_seconds: deal.durationSeconds,
    status: 'active',
  };
}
