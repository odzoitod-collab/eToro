import { supabase } from './supabase';
import type { ActivityHistoryItem } from '../types';

function normalizeItem(row: {
  id?: number;
  activity_type?: string;
  ticker?: string | null;
  quantity?: number | null;
  amount_rub?: number | null;
  payload?: Record<string, unknown> | null;
  created_at?: string;
}): ActivityHistoryItem {
  return {
    id: Number(row.id ?? 0),
    activity_type: (row.activity_type as ActivityHistoryItem['activity_type']) ?? 'trade',
    ticker: row.ticker ?? null,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    amount_rub: row.amount_rub != null ? Number(row.amount_rub) : null,
    payload: row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : null,
    created_at: String(row.created_at ?? ''),
  };
}

export async function fetchActivityHistory(userId: number): Promise<ActivityHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_activity_history', { p_user_id: userId });
  if (error) return [];
  if (!Array.isArray(data)) {
    try {
      const arr = typeof data === 'string' ? JSON.parse(data) : data;
      return Array.isArray(arr) ? arr.map(normalizeItem) : [];
    } catch {
      return [];
    }
  }
  return data.map(normalizeItem);
}
