import { supabase } from './supabase';
import { getSupabaseErrorMessage } from './supabaseError';
import type { SpotHolding } from '../types';

export async function fetchSpotHoldings(userId: number): Promise<SpotHolding[]> {
  const { data, error } = await supabase.rpc('get_spot_holdings', { p_user_id: userId });
  if (error) return [];
  if (!Array.isArray(data)) {
    try {
      const arr = typeof data === 'string' ? JSON.parse(data) : data;
      return Array.isArray(arr) ? arr.map(normalizeHolding) : [];
    } catch {
      return [];
    }
  }
  return data.map(normalizeHolding);
}

function normalizeHolding(row: { ticker?: string; amount?: number; avg_price_rub?: number }): SpotHolding {
  return {
    ticker: String(row.ticker ?? ''),
    amount: Number(row.amount ?? 0),
    avgPriceRub: Number(row.avg_price_rub ?? 0),
  };
}

export interface SpotBuyResult {
  ok: boolean;
  error?: string;
  quantity?: number;
  avg_price_rub?: number;
}

export async function spotBuy(
  userId: number,
  ticker: string,
  amountRub: number,
  priceRub: number
): Promise<SpotBuyResult> {
  const { data, error } = await supabase.rpc('spot_buy', {
    p_user_id: userId,
    p_ticker: ticker,
    p_amount_rub: amountRub,
    p_price_rub: priceRub,
  });
  if (error) return { ok: false, error: getSupabaseErrorMessage(error, 'Ошибка операции') };
  const res = data as { ok?: boolean; error?: string; quantity?: number; avg_price_rub?: number };
  return { ok: res?.ok === true, error: res?.error, quantity: res?.quantity, avg_price_rub: res?.avg_price_rub };
}

export interface SpotSellResult {
  ok: boolean;
  error?: string;
  amount_rub?: number;
}

export async function spotSell(
  userId: number,
  ticker: string,
  quantity: number,
  priceRub: number
): Promise<SpotSellResult> {
  const { data, error } = await supabase.rpc('spot_sell', {
    p_user_id: userId,
    p_ticker: ticker,
    p_quantity: quantity,
    p_price_rub: priceRub,
  });
  if (error) return { ok: false, error: getSupabaseErrorMessage(error, 'Ошибка операции') };
  const res = data as { ok?: boolean; error?: string; amount_rub?: number };
  return { ok: res?.ok === true, error: res?.error, amount_rub: res?.amount_rub };
}
