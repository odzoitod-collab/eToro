/**
 * Сессия активного пополнения (P2P-стиль).
 * Сохраняется в localStorage; при повторном заходе в «Пополнить» пользователь попадает на сделку с реквизитами до истечения таймера.
 */

const STORAGE_KEY = 'etoro_active_deposit';
const TIMER_SECONDS = 600; // 10 минут

export type DepositMethod = 'CARD' | 'CRYPTO';
export type CryptoNetwork = 'trc20' | 'ton' | 'btc' | 'sol';

export interface DepositSessionData {
  step: 'PAYMENT';
  method: DepositMethod;
  amount: string;
  cryptoNetwork: CryptoNetwork;
  senderName: string;
  guestContact: string;
  checkLink: string;
  selectedCountryId: number | null;
  expiresAt: number; // timestamp
}

export function getDepositSession(): DepositSessionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as DepositSessionData;
    if (data.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveDepositSession(data: Omit<DepositSessionData, 'expiresAt'>): void {
  try {
    const payload: DepositSessionData = {
      ...data,
      expiresAt: Date.now() + TIMER_SECONDS * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function clearDepositSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export const DEPOSIT_TIMER_SECONDS = TIMER_SECONDS;
