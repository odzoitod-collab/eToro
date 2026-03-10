/**
 * Извлечение читаемого текста ошибки из ответа Supabase/PostgREST.
 * Показывает реальное сообщение от БД вместо общей фразы «Ошибка базы данных».
 */
export function getSupabaseErrorMessage(err: unknown, fallback = 'Ошибка базы данных'): string {
  if (err == null) return fallback;
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const msg = e?.message?.trim();
  if (msg) return msg;
  if (e?.details?.trim()) return e.details.trim();
  if (e?.hint?.trim()) return e.hint.trim();
  if (e?.code) return `${fallback} (${e.code})`;
  if (typeof err === 'string') return err;
  return fallback;
}
