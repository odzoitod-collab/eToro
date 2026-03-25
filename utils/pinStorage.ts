/**
 * Хранение и проверка PIN по user id (tgid или webUserId).
 * PIN хранится в виде хеша SHA-256(pin + userId), в localStorage.
 * В окружениях без crypto.subtle (не-HTTPS) используется резервный хеш.
 */

const KEY_PREFIX = 'pin_hash_';

/** Резервный хеш, когда crypto.subtle недоступен (не-HTTPS). */
function fallbackHash(input: string): string {
  let h = 0;
  const s = input + KEY_PREFIX;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return Math.abs(h).toString(16) + s.length.toString(16);
}

async function hashPin(pin: string, userId: string): Promise<string> {
  const input = pin + ':' + userId;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const data = new TextEncoder().encode(input);
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // e.g. quota / disabled — используем резерв
    }
  }
  return fallbackHash(input);
}

function normalizeUserId(userId: string | number): string {
  const s = typeof userId === 'string' ? userId.trim() : String(userId ?? '');
  return s === 'undefined' || s === 'null' ? '' : s;
}

export function getStorageKey(userId: string): string {
  const normalized = normalizeUserId(userId);
  return KEY_PREFIX + (normalized || '');
}

export function hasStoredPin(userId: string | number): boolean {
  const normalized = normalizeUserId(userId);
  if (!normalized) return false;
  try {
    const key = getStorageKey(normalized);
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}

export async function setPin(userId: string | number, pin: string): Promise<void> {
  const normalized = normalizeUserId(userId);
  if (!normalized) return;
  const key = getStorageKey(normalized);
  const hash = await hashPin(pin, normalized);
  localStorage.setItem(key, hash);
}

export async function checkPin(userId: string | number, pin: string): Promise<boolean> {
  const normalized = normalizeUserId(userId);
  if (!normalized) return false;
  const key = getStorageKey(normalized);
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  const hash = await hashPin(pin, normalized);
  return hash === stored;
}
