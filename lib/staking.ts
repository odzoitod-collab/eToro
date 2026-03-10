import { supabase } from './supabase';
import { getSupabaseErrorMessage } from './supabaseError';
import type { StakingPosition, StakingRate } from '../types';

function normalizePosition(row: {
  ticker?: string;
  amount?: number;
  rewards_accrued?: number;
  staked_at?: string;
  last_accrual_ts?: string;
}): StakingPosition {
  return {
    ticker: String(row.ticker ?? ''),
    amount: Number(row.amount ?? 0),
    rewardsAccrued: Number(row.rewards_accrued ?? 0),
    stakedAt: String(row.staked_at ?? ''),
    lastAccrualTs: String(row.last_accrual_ts ?? ''),
  };
}

function normalizeRate(row: { ticker?: string; rate_per_month?: number }): StakingRate {
  return {
    ticker: String(row.ticker ?? ''),
    ratePerMonth: Number(row.rate_per_month ?? 0),
  };
}

export async function fetchStakingRates(): Promise<StakingRate[]> {
  const { data, error } = await supabase.rpc('get_staking_rates');
  if (error) return [];
  if (!Array.isArray(data)) {
    try {
      const arr = typeof data === 'string' ? JSON.parse(data) : data;
      return Array.isArray(arr) ? arr.map(normalizeRate) : [];
    } catch {
      return [];
    }
  }
  return data.map(normalizeRate);
}

export async function fetchStakingPositions(userId: number): Promise<StakingPosition[]> {
  const { data, error } = await supabase.rpc('get_staking_positions', { p_user_id: userId });
  if (error) return [];
  if (!Array.isArray(data)) {
    try {
      const arr = typeof data === 'string' ? JSON.parse(data) : data;
      return Array.isArray(arr) ? arr.map(normalizePosition) : [];
    } catch {
      return [];
    }
  }
  return data.map(normalizePosition);
}

/** Начислить накопленные часы стейкинга на баланс в валюте юзера (RUB). Вызывать перед загрузкой позиций при наличии цен. */
export async function accrualToBalance(
  userId: number,
  pricesRub: Record<string, number>
): Promise<void> {
  const payload = Object.fromEntries(
    Object.entries(pricesRub).filter(([, v]) => v != null && Number.isFinite(v) && v > 0)
  );
  if (Object.keys(payload).length === 0) return;
  await supabase.rpc('staking_accrual_to_balance', {
    p_user_id: userId,
    p_prices_rub: payload,
  });
}

export interface StakeResult {
  ok: boolean;
  error?: string;
  quantity?: number;
}

export async function stake(
  userId: number,
  ticker: string,
  quantity: number
): Promise<StakeResult> {
  const { data, error } = await supabase.rpc('staking_stake', {
    p_user_id: userId,
    p_ticker: ticker,
    p_quantity: quantity,
  });
  if (error) return { ok: false, error: getSupabaseErrorMessage(error, 'Ошибка операции') };
  const res = data as { ok?: boolean; error?: string; quantity?: number };
  return { ok: res?.ok === true, error: res?.error, quantity: res?.quantity };
}

export interface UnstakeResult {
  ok: boolean;
  error?: string;
  amountReturned?: number;
}

export async function unstake(
  userId: number,
  ticker: string,
  priceRub: number
): Promise<UnstakeResult> {
  const { data, error } = await supabase.rpc('staking_unstake', {
    p_user_id: userId,
    p_ticker: ticker,
    p_price_rub: priceRub,
  });
  if (error) return { ok: false, error: getSupabaseErrorMessage(error, 'Ошибка операции') };
  const res = data as { ok?: boolean; error?: string; amount_returned?: number };
  return {
    ok: res?.ok === true,
    error: res?.error,
    amountReturned: res?.amount_returned,
  };
}

/** Доход за 1 час при данной ставке в месяц (доля): amount * ratePerMonth / (30 * 24) */
export function rewardPerHour(amount: number, ratePerMonth: number): number {
  return amount * ratePerMonth / (30 * 24);
}
