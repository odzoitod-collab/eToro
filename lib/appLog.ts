/**
 * Логирование действий пользователя в Supabase (таблица app_actions).
 * Вызовы не блокируют UI; ошибки только в консоль.
 * При отсутствии таблицы или RLS — один раз за сессию выводится подсказка по миграции.
 */
import { supabase } from './supabase';

const APP_ACTIONS_MIGRATION_MSG =
  '[Sellbit] app_actions table missing or RLS not configured. Run supabase_app_actions_log_migration.sql to enable action logging.';

/** Коды ошибок, по которым уже выведено предупреждение в этой сессии (без дублей). */
const warnedErrorKeys = new Set<string>();

function getErrorKey(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) return String((err as { code: string }).code);
  if (err instanceof Error) return err.name || err.message;
  return String(err);
}

export type AppActionType =
  | 'login'
  | 'register'
  | 'logout'
  | 'deposit_request'
  | 'deposit_guest'
  | 'withdraw_request'
  | 'withdraw_blocked'
  | 'deal_open'
  | 'spot_buy'
  | 'spot_sell'
  | 'stake'
  | 'unstake'
  | 'kyc_submit'
  | 'pin_create'
  | 'pin_change'
  | 'currency_change'
  | 'language_change';

export interface LogActionOptions {
  userId?: number | null;
  tgid?: string | null;
  payload?: Record<string, unknown>;
}

export async function logAction(
  actionType: AppActionType,
  options: LogActionOptions = {}
): Promise<void> {
  const { userId = null, tgid = null, payload = null } = options;
  try {
    await supabase.from('app_actions').insert({
      user_id: userId ?? null,
      tgid: tgid ?? null,
      action_type: actionType,
      payload: payload ? (payload as object) : null,
    });
  } catch (err) {
    const key = getErrorKey(err);
    if (!warnedErrorKeys.has(key)) {
      warnedErrorKeys.add(key);
      console.warn(APP_ACTIONS_MIGRATION_MSG);
    }
  }
}
