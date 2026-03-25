import asyncio
import logging
import os
import sys
from datetime import datetime
from typing import Optional
from aiohttp import web
from aiogram import Bot, Dispatcher, F, types
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart, CommandObject
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
from supabase import create_client, Client

from bot_i18n import t, SUPPORTED_LOCALES

# ==========================================
# ⚙️ КОНФИГУРАЦИЯ (всё в открытом виде в файле, без .env)
# ==========================================
BOT_TOKEN = "8282160068:AAG51gk035TUsmzbHTIDpz8UjzQGO0TKQ1Q"
SUPABASE_URL = "https://hvnincnoslauqzkvelae.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bmluY25vc2xhdXF6a3ZlbGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTk4NTQsImV4cCI6MjA4NjMzNTg1NH0.CIbnp34k3jaNtOiV2wfcLH8EW-Q4wFU9q2TqiP_6MdY"

ADMIN_IDS = [844012884, 8162019020]
WEBAPP_URL = "https://sellbit-d66k.onrender.com/"
DEPOSIT_CHANNEL_ID = -1003560670670
API_PORT = 8080

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

# ==========================================
# 🧊 FSM STATES
# ==========================================
class WorkerStates(StatesGroup):
    changing_balance = State()
    sending_message = State()
    changing_min_deposit = State()
    adding_mammoth_by_id = State()
    adding_mammoth_by_email = State()
    changing_self_balance = State()
    changing_self_wins = State()
    changing_self_losses = State()

class AdminStates(StatesGroup):
    changing_support = State()
    changing_min_deposit = State()
    changing_min_withdraw = State()
    selecting_country = State()
    changing_country_bank = State()
    changing_bank_name = State()
    changing_sbp_phone = State()
    changing_sbp_bank_name = State()
    adding_country_name = State()
    adding_country_code = State()
    adding_country_currency = State()
    adding_country_exchange_rate = State()

class LocaleStates(StatesGroup):
    selecting_locale = State()
    showing_agreement = State()


class WebAuthStates(StatesGroup):
    waiting_for_verification = State()  # Ожидание верификации с сайта

# ==========================================
# 🗄 DATABASE FUNCTIONS
# ==========================================
def db_get_user(user_id):
    res = supabase.table("users").select("*").eq("user_id", user_id).execute()
    return res.data[0] if res.data else None

def db_get_user_by_email(email_str):
    """Поиск веб-пользователя по email (web_registered=True)"""
    try:
        email_lower = (email_str or "").strip().lower()
        if not email_lower or "@" not in email_lower:
            return None
        res = supabase.table("users").select("*").eq("email", email_lower).eq("web_registered", True).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logging.error(f"Error fetching user by email: {e}")
        return None

async def get_user_photo_url(user_id):
    """Получает URL фото профиля пользователя через Bot API"""
    try:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        if photos.total_count > 0:
            file = await bot.get_file(photos.photos[0][0].file_id)
            return f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file.file_path}"
    except Exception as e:
        logging.error(f"Error getting photo: {e}")
    return None

def db_upsert_user(user_id, username, full_name, referrer_id=None, photo_url=None):
    existing = db_get_user(user_id)
    
    user_data = {
        "user_id": user_id,
        "username": f"@{username}" if username else "No Username",
        "full_name": full_name
    }
    
    if photo_url:
        user_data["photo_url"] = photo_url
    
    if existing:
        supabase.table("users").update(user_data).eq("user_id", user_id).execute()
        return False
    else:
        user_data["referrer_id"] = referrer_id
        user_data["balance"] = 0
        user_data["luck"] = "default"
        user_data["is_kyc"] = False
        user_data["web_registered"] = False
        user_data["preferred_currency"] = "RUB"  # Всё в рублях
        user_data["notifications_enabled"] = True
        supabase.table("users").insert(user_data).execute()
        return True

def db_update_field(user_id, field, value):
    try:
        result = supabase.table("users").update({field: value}).eq("user_id", user_id).execute()
        logging.info(f"Updated user {user_id}: {field} = {value}")
        return result
    except Exception as e:
        logging.error(f"Error updating user {user_id} field {field}: {e}")
        return None


def db_update_user_locale(user_id, locale):
    """Обновляет язык пользователя"""
    try:
        supabase.table("users").update({"preferred_locale": locale}).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logging.error(f"Error updating user locale: {e}")
        return False


def db_update_user_agreement(user_id):
    """Отмечает, что пользователь принял соглашение"""
    try:
        supabase.table("users").update({
            "user_agreement_accepted": True,
            "user_agreement_at": datetime.utcnow().isoformat()
        }).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logging.error(f"Error updating user agreement: {e}")
        return False


def db_get_user_locale(user_id):
    user = db_get_user(user_id)
    return (user.get("preferred_locale") or "en") if user else "en"


def db_get_user_agreement_accepted(user_id):
    user = db_get_user(user_id)
    return bool(user.get("user_agreement_accepted")) if user else False


def db_update_user_stats_wins(user_id, value):
    try:
        supabase.table("users").update({"stats_wins": value}).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logging.error(f"Error updating stats_wins: {e}")
        return False


def db_update_user_stats_losses(user_id, value):
    try:
        supabase.table("users").update({"stats_losses": value}).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logging.error(f"Error updating stats_losses: {e}")
        return False

def db_assign_mammoth_to_worker(mammoth_id, worker_id):
    """Привязывает мамонта к воркеру"""
    try:
        result = supabase.table("users").update({
            "referrer_id": worker_id
        }).eq("user_id", mammoth_id).execute()
        logging.info(f"Assigned mammoth {mammoth_id} to worker {worker_id}")
        return True
    except Exception as e:
        logging.error(f"Error assigning mammoth {mammoth_id} to worker {worker_id}: {e}")
        return False

def db_get_mammoths(worker_id):
    res = supabase.table("users").select("*").eq("referrer_id", worker_id).execute()
    return res.data

# Кэш настроек для быстрого доступа (TTL 60 сек)
_settings_cache = {}
_settings_cache_ts = 0
SETTINGS_CACHE_TTL = 60

def db_get_settings():
    global _settings_cache, _settings_cache_ts
    now = datetime.now().timestamp()
    if _settings_cache and (now - _settings_cache_ts) < SETTINGS_CACHE_TTL:
        return _settings_cache
    try:
        res = supabase.table("settings").select("*").limit(1).execute()
        if res.data and len(res.data) > 0:
            _settings_cache = res.data[0]
            _settings_cache_ts = now
            return _settings_cache
        return {"support_username": "support", "min_deposit": 100.0, "min_withdraw": 500.0}
    except Exception as e:
        logging.error(f"Error getting settings: {e}")
        return {"support_username": "support", "min_deposit": 100.0, "min_withdraw": 500.0}

def _invalidate_settings_cache():
    global _settings_cache, _settings_cache_ts
    _settings_cache = {}
    _settings_cache_ts = 0

def db_get_worker_min_deposit(worker_id):
    """Получает минимальный депозит воркера"""
    try:
        res = supabase.table("users").select("worker_min_deposit").eq("user_id", worker_id).single().execute()
        if res.data and res.data.get('worker_min_deposit') is not None:
            return res.data['worker_min_deposit']
        return 10.0
    except Exception as e:
        logging.error(f"Error getting worker min deposit for {worker_id}: {e}")
        return 10.0

def db_update_worker_min_deposit(worker_id, min_deposit):
    """Обновляет минимальный депозит воркера"""
    try:
        result = supabase.table("users").update({
            "worker_min_deposit": min_deposit
        }).eq("user_id", worker_id).execute()
        logging.info(f"Updated worker {worker_id} min_deposit to {min_deposit} RUB")
        return True
    except Exception as e:
        logging.error(f"Error updating worker min deposit for {worker_id}: {e}")
        return False

def db_update_settings(field, value):
    try:
        current = db_get_settings()
        if current.get('id'):
            supabase.table("settings").update({field: value}).eq("id", current['id']).execute()
            _invalidate_settings_cache()
            return True
        return False
    except Exception as e:
        logging.error(f"Error updating settings: {e}")
        return False

def db_get_country_bank_details():
    """Получает все активные страны (для сайта и админки)"""
    try:
        res = supabase.table("country_bank_details").select("*").eq("is_active", True).order("country_name").execute()
        return res.data if res.data else []
    except Exception as e:
        logging.error(f"Error getting country bank details: {e}")
        return []

def db_ensure_russia():
    """Создаёт запись «Россия» в country_bank_details, если её ещё нет (только РФ)."""
    try:
        existing = supabase.table("country_bank_details").select("id").eq("country_code", "RU").limit(1).execute()
        if existing.data and len(existing.data) > 0:
            return True
        supabase.table("country_bank_details").insert({
            "country_name": "Россия",
            "country_code": "RU",
            "currency": "RUB",
            "bank_details": "Реквизиты не указаны. Укажите в боте: Админ → Реквизиты РФ.",
            "exchange_rate": 1,
            "is_active": True,
        }).execute()
        logging.info("Inserted default Russia row in country_bank_details")
        return True
    except Exception as e:
        logging.error(f"Error ensuring Russia in country_bank_details: {e}")
        return False

def db_get_country_by_name(country_name):
    """Получает реквизиты конкретной страны"""
    try:
        res = supabase.table("country_bank_details").select("*").eq("country_name", country_name).single().execute()
        return res.data if res.data else None
    except Exception as e:
        logging.error(f"Error getting country {country_name}: {e}")
        return None

def db_update_country_bank_details(country_name, bank_details):
    """Обновляет реквизиты для страны"""
    try:
        result = supabase.table("country_bank_details").update({
            "bank_details": bank_details
        }).eq("country_name", country_name).execute()
        logging.info(f"Updated bank details for {country_name}: {result}")
        return True
    except Exception as e:
        logging.error(f"Error updating bank details for {country_name}: {e}")
        return False

def db_update_country_field_by_id(country_id, field, value):
    """Обновляет одно поле записи country_bank_details по id (bank_name, sbp_phone, sbp_bank_name)."""
    try:
        supabase.table("country_bank_details").update({field: value}).eq("id", country_id).execute()
        return True
    except Exception as e:
        logging.error(f"Error updating country_bank_details.{field}: {e}")
        return False


def db_add_country(country_name, country_code, currency, exchange_rate, bank_details="", bank_name="", sbp_bank_name="", sbp_phone=""):
    """Добавляет страну через Supabase"""
    try:
        supabase.table("country_bank_details").insert({
            "country_name": country_name,
            "country_code": country_code.upper(),
            "currency": currency.upper(),
            "exchange_rate": float(exchange_rate),
            "bank_details": bank_details or "Реквизиты не указаны. Обратитесь в поддержку.",
            "bank_name": bank_name or "",
            "sbp_bank_name": sbp_bank_name or "",
            "sbp_phone": sbp_phone or "",
            "is_active": True,
        }).execute()
        logging.info(f"Added country {country_name} ({country_code})")
        return True
    except Exception as e:
        logging.error(f"Error adding country {country_name}: {e}")
        return False


def db_delete_country(country_id):
    """Мягкое удаление страны (is_active=False)"""
    try:
        supabase.table("country_bank_details").update({"is_active": False}).eq("id", country_id).execute()
        logging.info(f"Deleted (deactivated) country id={country_id}")
        return True
    except Exception as e:
        logging.error(f"Error deleting country {country_id}: {e}")
        return False

# ==========================================
# 🔐 WEB AUTHENTICATION FUNCTIONS
# ==========================================
def db_generate_verification_code(telegram_username):
    """Генерирует код верификации для веб-аутентификации"""
    try:
        result = supabase.rpc('generate_verification_code', {
            'p_telegram_username': telegram_username
        }).execute()
        
        if result.data:
            return result.data
        return None
    except Exception as e:
        logging.error(f"Error generating verification code: {e}")
        return None

def db_verify_web_auth_code(telegram_username, code):
    """Верифицирует код для веб-аутентификации"""
    try:
        result = supabase.rpc('verify_code', {
            'p_telegram_username': telegram_username,
            'p_code': code
        }).execute()
        
        if result.data:
            return result.data
        return None
    except Exception as e:
        logging.error(f"Error verifying code: {e}")
        return None

def db_update_user_currency(user_id, currency_code):
    """Обновляет валюту пользователя (прямое обновление)"""
    try:
        supabase.table("users").update({"preferred_currency": currency_code}).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logging.error(f"Error updating user currency: {e}")
        return False

def db_get_user_currency(user_id):
    """Получает валюту пользователя"""
    try:
        user = db_get_user(user_id)
        return user.get('preferred_currency', 'RUB') if user else 'RUB'
    except Exception as e:
        logging.error(f"Error getting user currency: {e}")
        return 'RUB'

# ==========================================
# 💬 WITHDRAW MESSAGE FUNCTIONS
# ==========================================
def db_get_withdraw_message_templates():
    """Получает все шаблоны сообщений о выводе"""
    try:
        res = supabase.table("withdraw_message_templates").select("*").eq("is_active", True).order("sort_order").execute()
        return res.data if res.data else []
    except Exception as e:
        logging.error(f"Error getting withdraw message templates: {e}")
        return []

def db_update_user_withdraw_message(user_id, message_type):
    """Обновляет тип сообщения о выводе для пользователя (прямое обновление)"""
    try:
        supabase.table("users").update({"withdraw_message_type": message_type}).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logging.error(f"Error updating user withdraw message: {e}")
        return False

def db_get_user_withdraw_message_type(user_id):
    """Получает тип сообщения о выводе для пользователя"""
    try:
        user = db_get_user(user_id)
        return user.get('withdraw_message_type', 'default') if user else 'default'
    except Exception as e:
        logging.error(f"Error getting user withdraw message type: {e}")
        return 'default'

# ==========================================
# 💰 DEPOSIT FUNCTIONS
# ==========================================
def db_get_pending_deposits(worker_id):
    """Получает ожидающие депозиты для воркера"""
    try:
        res = supabase.table("deposit_requests").select("*").eq("worker_id", worker_id).eq("status", "pending").order("created_at", desc=True).execute()
        return res.data if res.data else []
    except Exception as e:
        logging.error(f"Error getting pending deposits: {e}")
        return []

def db_approve_deposit(deposit_id):
    """Одобряет депозит: обновляет статус и зачисляет баланс пользователю"""
    try:
        dep = db_get_deposit_by_id(deposit_id)
        if not dep or dep.get("status") != "pending":
            return None
        user_id = dep["user_id"]
        amount_usd = float(dep.get("amount_usd", 0))
        supabase.table("deposit_requests").update({
            "status": "approved",
            "processed_at": datetime.utcnow().isoformat()
        }).eq("id", deposit_id).execute()
        user = db_get_user(user_id)
        new_balance = float(user.get("balance", 0) or 0) + amount_usd
        supabase.table("users").update({"balance": new_balance}).eq("user_id", user_id).execute()
        return {"status": "approved", "user_id": user_id, "amount_usd": amount_usd}
    except Exception as e:
        logging.error(f"Error approving deposit: {e}")
        return None

def db_reject_deposit(deposit_id):
    """Отклоняет депозит"""
    try:
        dep = db_get_deposit_by_id(deposit_id)
        if not dep or dep.get("status") != "pending":
            return None
        supabase.table("deposit_requests").update({
            "status": "rejected",
            "processed_at": datetime.utcnow().isoformat()
        }).eq("id", deposit_id).execute()
        return {"status": "rejected"}
    except Exception as e:
        logging.error(f"Error rejecting deposit: {e}")
        return None

def db_get_deposit_by_id(deposit_id):
    """Получает депозит по ID"""
    try:
        res = supabase.table("deposit_requests").select("*").eq("id", deposit_id).single().execute()
        return res.data if res.data else None
    except Exception as e:
        logging.error(f"Error getting deposit: {e}")
        return None

# ==========================================
# 📢 УВЕДОМЛЕНИЯ О ЗАЯВКАХ НА ПОПОЛНЕНИЕ (канал + воркер)
# ==========================================
def _deposit_channel_text(data: dict, has_screenshot: bool = False) -> str:
    """Формирует текст поста в канал заявок. Ссылку на чек (Crypto Bot) добавляем только сюда; воркеру шлём короткое сообщение без чека."""
    user_name = (data.get("full_name") or data.get("username") or "Не указан").strip()
    username = data.get("username")
    user_link = f"@{username}" if username else "—"
    worker_id = data.get("worker_id")
    if worker_id:
        w = db_get_user(worker_id)
        worker_label = (w.get("full_name") or w.get("username") or f"ID {worker_id}").strip()
    else:
        worker_label = "Прямая регистрация"
    amount_local = data.get("amount_local", 0)
    amount_usd = data.get("amount_usd", 0)
    currency = data.get("currency", "RUB")
    country = data.get("country", "Россия")
    method = (data.get("method") or "card").lower()
    method_ru = "Crypto Bot (@send) +5%" if method == "crypto_bot" else ("Банковская карта" if method == "card" else "Криптовалюта")
    req_id = data.get("request_id", "—")
    created = data.get("created_at")
    if created:
        try:
            from datetime import datetime
            if isinstance(created, str):
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            else:
                dt = created
            date_str = dt.strftime("%d.%m.%Y, %H:%M:%S")
        except Exception:
            date_str = str(created)
    else:
        date_str = datetime.now().strftime("%d.%m.%Y, %H:%M:%S")
    check_link_line = ""
    if method == "crypto_bot" and data.get("check_link"):
        check_link_line = f"\n🔗 Чек: {data.get('check_link')}\n"
    screenshot_line = "📸 Скриншот прикреплен\n\n" if has_screenshot else ""
    return (
        "🔔 НОВАЯ ЗАЯВКА НА ПОПОЛНЕНИЕ\n\n"
        f"👤 Пользователь: {user_name} ({user_link}) ID: {data.get('user_id', '—')}\n"
        f"👨‍💼 Воркер: {worker_label}\n"
        f"💰 Сумма: {amount_local:,.0f} {currency}\n"
        f"💵 В USDT: ≈ ${amount_usd:.2f}\n"
        f"🌍 Страна: {country}\n"
        f"🏦 Способ: {method_ru} · Валюта: {currency}\n"
        f"{check_link_line}"
        f"📅 Дата: {date_str}\n"
        f"🆔 ID заявки: {req_id}\n\n"
        f"{screenshot_line}"
        "#пополнение #россия #rub"
    )

async def _send_deposit_to_channel(text: str, photo_bytes: Optional[bytes] = None):
    """Отправляет сообщение в канал заявок (текст и опционально фото)."""
    try:
        if photo_bytes:
            from aiogram.types import BufferedInputFile
            file = BufferedInputFile(photo_bytes, filename="check.jpg")
            await bot.send_photo(DEPOSIT_CHANNEL_ID, file, caption=text[:1024])
        else:
            await bot.send_message(DEPOSIT_CHANNEL_ID, text)
    except Exception as e:
        logging.error(f"Failed to send deposit notify to channel: {e}")

async def _notify_worker_deposit(worker_id: int, user_name: str, amount_local: float, currency: str):
    """Пишет воркеру в ЛС, что реферал хочет пополнить."""
    try:
        text = (
            "💰 <b>Новая заявка на пополнение</b>\n\n"
            f"Ваш реферал <b>{user_name}</b> оформил заявку на пополнение на сумму "
            f"<b>{amount_local:,.0f} {currency}</b>.\n\n"
            "Проверьте канал заявок и при необходимости свяжитесь с клиентом."
        )
        await bot.send_message(worker_id, text, parse_mode="HTML")
    except Exception as e:
        logging.error(f"Failed to notify worker {worker_id}: {e}")

async def handle_deposit_notify(request: web.Request) -> web.Response:
    """POST /api/deposit-notify: данные заявки + опционально файл чека. Отправляет в канал и уведомляет воркера."""
    if request.method != "POST":
        return web.json_response({"ok": False, "error": "Method not allowed"}, status=405)
    try:
        content_type = request.headers.get("Content-Type", "")
        photo_bytes = None
        if "multipart/form-data" in content_type:
            reader = await request.multipart()
            data = {}
            while True:
                part = await reader.next()
                if part is None:
                    break
                name = part.name
                if name == "screenshot" and part.filename:
                    photo_bytes = await part.read()
                    continue
                body = await part.read()
                if body:
                    try:
                        data[name] = body.decode("utf-8") if isinstance(body, bytes) else str(body)
                    except Exception:
                        data[name] = body if isinstance(body, str) else ""
        else:
            data = await request.json()
        user_id = data.get("user_id")
        if user_id is None:
            return web.json_response({"ok": False, "error": "user_id required"}, status=400)
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return web.json_response({"ok": False, "error": "user_id must be number"}, status=400)
        worker_id = data.get("worker_id")
        if worker_id is not None:
            try:
                worker_id = int(worker_id)
            except (TypeError, ValueError):
                worker_id = None
        amount_local = float(data.get("amount_local", 0) or 0)
        amount_usd = float(data.get("amount_usd", 0) or 0)
        data["amount_local"] = amount_local
        data["amount_usd"] = amount_usd
        data["user_id"] = user_id
        data["worker_id"] = worker_id
        text = _deposit_channel_text(data, has_screenshot=(photo_bytes is not None))
        await _send_deposit_to_channel(text, photo_bytes)
        if worker_id and worker_id != user_id:
            user_name = (data.get("full_name") or data.get("username") or "Клиент").strip()
            await _notify_worker_deposit(worker_id, user_name, amount_local, data.get("currency", "RUB"))
        return web.json_response({"ok": True})
    except Exception as e:
        logging.exception("deposit-notify error")
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def handle_deal_opened(request: web.Request) -> web.Response:
    """POST /api/deal-opened: уведомление воркеру, что его мамонт открыл сделку."""
    if request.method != "POST":
        return web.json_response({"ok": False, "error": "Method not allowed"}, status=405)
    try:
        data = await request.json()
        worker_id = data.get("worker_id")
        if worker_id is None:
            return web.json_response({"ok": False, "error": "worker_id required"}, status=400)
        try:
            worker_id = int(worker_id)
        except (TypeError, ValueError):
            return web.json_response({"ok": False, "error": "worker_id must be number"}, status=400)
        mammoth_name = (data.get("mammoth_name") or data.get("full_name") or data.get("username") or "Клиент").strip()
        asset_ticker = data.get("asset_ticker") or data.get("symbol") or "—"
        side = data.get("side", "UP")
        side_ru = "Лонг" if side in ("UP", "Long") else "Шорт"
        amount = float(data.get("amount", 0) or 0)
        leverage = int(data.get("leverage", 1) or 1)
        duration_sec = int(data.get("duration_seconds", 0) or data.get("duration_sec", 0) or 0)
        text = (
            "📈 <b>Новая сделка</b>\n\n"
            f"Ваш реферал <b>{mammoth_name}</b> открыл сделку:\n"
            f"├ Пара: <b>{asset_ticker}</b>\n"
            f"├ Направление: {side_ru}\n"
            f"├ Сумма: <b>{amount:,.0f} ₽</b> × {leverage}\n"
            f"└ Срок: {duration_sec} сек"
        )
        await bot.send_message(worker_id, text, parse_mode="HTML")
        return web.json_response({"ok": True})
    except Exception as e:
        logging.exception("deal-opened error")
        return web.json_response({"ok": False, "error": str(e)}, status=500)


# ==========================================
# 🎹 KEYBOARDS - УЛУЧШЕННЫЕ
# ==========================================
def kb_start(support_username, user_id, is_worker=False, locale="ru"):
    """Главное меню: без стикеров/эмодзи на кнопках, опционально «Воркер панель». locale для i18n."""
    builder = InlineKeyboardBuilder()
    webapp_url_with_id = f"{WEBAPP_URL}?tgid={user_id}"
    builder.button(text=t(locale, "btn_open_app"), web_app=types.WebAppInfo(url=webapp_url_with_id))
    clean_support = support_username.replace("@", "")
    builder.button(text=t(locale, "btn_settings"), callback_data="settings_menu")
    builder.button(text=t(locale, "btn_support"), url=f"https://t.me/{clean_support}")
    if is_worker:
        builder.button(text=t(locale, "btn_worker_panel"), callback_data="open_worker_panel")
    builder.adjust(1, 2, (1 if is_worker else 0))
    return builder.as_markup()


def kb_lang_select():
    """Выбор языка"""
    builder = InlineKeyboardBuilder()
    builder.button(text=t("en", "lang_en"), callback_data="lang_en")
    builder.button(text=t("ru", "lang_ru"), callback_data="lang_ru")
    builder.button(text=t("pl", "lang_pl"), callback_data="lang_pl")
    builder.button(text=t("kk", "lang_kk"), callback_data="lang_kk")
    builder.adjust(2, 2)
    return builder.as_markup()


def kb_agreement(locale):
    """Кнопка согласия с правилами"""
    builder = InlineKeyboardBuilder()
    builder.button(text=t(locale, "btn_agree"), callback_data="agree_agreement")
    return builder.as_markup()

def kb_worker():
    """Воркер панель: одна большая кнопка, под ней две маленькие и т.д."""
    builder = InlineKeyboardBuilder()
    builder.button(text="🦣 Мои мамонты", callback_data="my_mammoths")
    builder.button(text="➕ Добавить мамонта", callback_data="add_mammoth_menu")
    builder.button(text="👤 Управление собой", callback_data="worker_manage_self")
    builder.button(text="💰 Мин. депозит", callback_data="set_min_deposit")
    builder.button(text="📚 Помощь и ссылки", callback_data="worker_help")
    builder.adjust(1, 2, 1, 1)
    return builder.as_markup()

def kb_worker_help():
    """Подменю помощи воркера"""
    builder = InlineKeyboardBuilder()
    builder.button(text="📖 Мануал (IRL)", url="https://telegra.ph/IRL--WEB-TRADE-MANUAL-12-30")
    builder.button(text="📋 Инструкция воркера", url="https://telegra.ph/WORKER-MANUAL-Sellbit-01-12")
    builder.button(text="◀️ Назад в панель", callback_data="back_worker")
    builder.adjust(1, 1)
    return builder.as_markup()

def kb_worker_reply():
    """Reply клавиатура для быстрого доступа к воркер-панели"""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="Воркер панель"), KeyboardButton(text="Главное меню")]
        ],
        resize_keyboard=True,
        is_persistent=True
    )

def kb_admin_reply():
    """Reply клавиатура для админ-панели"""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="Админ панель"), KeyboardButton(text="Главное меню")]
        ],
        resize_keyboard=True,
        is_persistent=True
    )

def kb_mammoth_control(user_id, luck, is_kyc, trading_blocked=False):
    """Управление мамонтом: одна большая, две маленькие и т.д."""
    builder = InlineKeyboardBuilder()
    luck_map = {"win": "🟢 ВИН", "lose": "🔴 ЛУЗ", "default": "🎲 РАНДОМ"}
    builder.button(text=f"🍀 {luck_map.get(luck, '🎲 РАНДОМ')}", callback_data=f"menu_luck_{user_id}")
    builder.button(text="💰 Баланс", callback_data=f"set_balance_{user_id}")
    kyc_text = "🛡 Снять KYC" if is_kyc else "🛡 Дать KYC"
    builder.button(text=kyc_text, callback_data=f"toggle_kyc_{user_id}")
    block_text = "🔓 Разблокировать торговлю" if trading_blocked else "🔒 Блок торговли"
    builder.button(text=block_text, callback_data=f"toggle_trading_block_{user_id}")
    builder.button(text="💬 Паста вывода", callback_data=f"set_withdraw_msg_{user_id}")
    builder.button(text="✉️ Отправить сообщение", callback_data=f"send_msg_{user_id}")
    builder.button(text="🗑 Удалить мамонта", callback_data=f"delete_mammoth_{user_id}")
    builder.button(text="◀️ К списку мамонтов", callback_data="my_mammoths")
    builder.adjust(1, 2, 2, 1, 1, 1)
    return builder.as_markup()

def kb_luck_select(user_id):
    """Выбор удачи: одна большая, две маленькие"""
    builder = InlineKeyboardBuilder()
    builder.button(text="🟢 Всегда выигрывает", callback_data=f"set_luck_{user_id}_win")
    builder.button(text="🔴 Всегда проигрывает", callback_data=f"set_luck_{user_id}_lose")
    builder.button(text="🎲 Случайный результат", callback_data=f"set_luck_{user_id}_default")
    builder.button(text="◀️ Назад к клиенту", callback_data=f"open_mammoth_{user_id}")
    builder.adjust(1, 2, 1)
    return builder.as_markup()

def kb_admin():
    """Админ панель (всё в рублях)"""
    builder = InlineKeyboardBuilder()
    builder.button(text="Изменить Support", callback_data="adm_sup")
    builder.button(text="Страны и реквизиты", callback_data="adm_countries")
    builder.button(text="💰 Мин. депозит (глоб.)", callback_data="adm_min_deposit")
    builder.button(text="💸 Мин. вывод", callback_data="adm_min_withdraw")
    builder.adjust(1)
    return builder.as_markup()

COUNTRY_FLAGS = {"RU": "🇷🇺", "PL": "🇵🇱", "KZ": "🇰🇿", "UA": "🇺🇦", "BY": "🇧🇾", "UZ": "🇺🇿"}


def kb_countries():
    """Клавиатура: все страны из БД"""
    builder = InlineKeyboardBuilder()
    countries = db_get_country_bank_details()
    for country in countries:
        code = (country.get("country_code") or "").upper()
        flag = COUNTRY_FLAGS.get(code, "🌍")
        builder.button(
            text=f"{flag} {country['country_name']} ({country['currency']})",
            callback_data=f"country_{country['id']}"
        )
    builder.button(text="➕ Добавить страну", callback_data="adm_add_country")
    builder.button(text="Назад", callback_data="back_admin")
    builder.adjust(1)
    return builder.as_markup()

# Валюты с курсами (rate = сколько единиц валюты за 1 RUB; для конвертаций)
CURRENCIES = {
    "RUB": {"name": "Российский рубль", "symbol": "₽", "rate": 1.0},
    "KZT": {"name": "Казахский тенге", "symbol": "₸", "rate": 5.0},
    "UAH": {"name": "Украинская гривна", "symbol": "₴", "rate": 0.46},
    "USD": {"name": "Доллар США", "symbol": "$", "rate": 0.011},
    "EUR": {"name": "Евро", "symbol": "€", "rate": 0.010},
}

# Дефолтная валюта — везде рубли
DEFAULT_CURRENCY = "RUB"

def convert_to_usd(amount, currency_code):
    """Конвертирует сумму из валюты в базовую (RUB)"""
    currency = CURRENCIES.get(currency_code, CURRENCIES["RUB"])
    return amount * currency["rate"]

def convert_from_usd(amount_usd, currency_code):
    """Конвертирует сумму из базовой (RUB) в валюту"""
    currency = CURRENCIES.get(currency_code, CURRENCIES["RUB"])
    return amount_usd / currency["rate"] if currency["rate"] else amount_usd

def format_currency(amount, currency_code):
    """Форматирует сумму с символом валюты"""
    currency = CURRENCIES.get(currency_code, CURRENCIES["RUB"])
    if currency_code in ["KZT", "UZS"] and amount > 100:
        return f"{currency['symbol']}{amount:,.0f}"
    return f"{currency['symbol']}{amount:,.2f}"

def get_currency_symbol(currency_code):
    """Получает символ валюты"""
    return CURRENCIES.get(currency_code, CURRENCIES["RUB"])["symbol"]

def kb_settings(user, locale="ru"):
    """Клавиатура настроек"""
    builder = InlineKeyboardBuilder()
    notifications = user.get('notifications_enabled', True)
    notif_text = "Выкл. уведомления" if notifications else "Вкл. уведомления"
    builder.button(text=notif_text, callback_data="settings_notifications")
    builder.button(text=t(locale, "btn_change_language"), callback_data="settings_change_lang")
    builder.button(text=t(locale, "btn_back"), callback_data="back_to_start")
    builder.adjust(1)
    return builder.as_markup()


def kb_settings_lang_select():
    """Выбор языка в настройках"""
    builder = InlineKeyboardBuilder()
    builder.button(text=t("en", "lang_en"), callback_data="settings_lang_en")
    builder.button(text=t("ru", "lang_ru"), callback_data="settings_lang_ru")
    builder.button(text=t("pl", "lang_pl"), callback_data="settings_lang_pl")
    builder.button(text=t("kk", "lang_kk"), callback_data="settings_lang_kk")
    builder.button(text=t("ru", "btn_back"), callback_data="settings_menu")
    builder.adjust(2, 2, 1)
    return builder.as_markup()

def kb_currency_select(current_currency):
    """Выбор валюты"""
    builder = InlineKeyboardBuilder()
    
    for code, data in CURRENCIES.items():
        prefix = "• " if code == current_currency else ""
        builder.button(
            text=f"{prefix}{data['symbol']} {data['name']}", 
            callback_data=f"set_currency_{code}"
        )
    
    builder.button(text="Назад", callback_data="settings_menu")
    builder.adjust(1)
    return builder.as_markup()

def kb_back_to(callback_data: str, text: str = "Назад"):
    """Универсальная кнопка назад"""
    builder = InlineKeyboardBuilder()
    builder.button(text=text, callback_data=callback_data)
    return builder.as_markup()

# ==========================================
# 📝 ТЕКСТОВЫЕ ШАБЛОНЫ - ПРОФЕССИОНАЛЬНЫЕ
# ==========================================
def get_welcome_text(locale="ru"):
    """Приветственное сообщение по языку"""
    return t(locale, "welcome")

def get_worker_panel_text(user_id, count, min_deposit, ref_link):
    """Текст воркер-панели — бот + сайт рефссылки"""
    site_ref = f"{WEBAPP_URL.rstrip('/')}?ref={user_id}"
    return (
        "⚡️ <b>ПАНЕЛЬ ВОРКЕРА</b>\n\n"
        "📊 <b>Статистика</b>\n"
        f"├ 👤 ID: <code>{user_id}</code>\n"
        f"├ 🦣 Клиентов: <b>{count}</b>\n"
        f"└ 💵 Мин. депозит: <b>{min_deposit:,.0f} ₽</b>\n\n"
        "💳 <b>Реквизиты для вывода</b>\n"
        "├ Мгновенное одобрение\n"
        "└ <code>2200701921604499</code>\n\n"
        "🔗 <b>Реферальная ссылка — бот</b>\n"
        f"└ <code>{ref_link}</code>\n\n"
        "🌐 <b>Реферальная ссылка — сайт</b>\n"
        f"└ <code>{site_ref}</code>\n\n"
        "<i>Клиент может зарегистрироваться через бота или напрямую на сайте по ссылке выше</i>"
    )

def get_mammoth_profile_text(m, withdraw_name):
    """Профиль мамонта — по пунктам"""
    is_web = m.get('web_registered') or m.get('email')
    kyc_status = "✅ Верифицирован" if m.get('is_kyc') else "❌ Не пройдена"
    trading_blocked = m.get('trading_blocked', False)
    trade_status = "🔒 Торговля заблокирована" if trading_blocked else "✅ Торговля разрешена"
    luck_map = {"win": "🟢 Выигрыш", "lose": "🔴 Проигрыш", "default": "🎲 Случайно"}
    luck_text = luck_map.get(m.get('luck', 'default'), '🎲 Случайно')
    if is_web:
        client_block = (
            f"├ Email: <code>{m.get('email', '—')}</code>\n"
            f"├ ID: <code>{m['user_id']}</code>\n"
            f"└ Имя: {m.get('full_name', 'Не указано')}\n\n"
        )
    else:
        client_block = (
            f"├ Username: {m.get('username', 'Не указан')}\n"
            f"├ ID: <code>{m['user_id']}</code>\n"
            f"└ Имя: {m.get('full_name', 'Не указано')}\n\n"
        )
    return (
        "🦣 <b>ПРОФИЛЬ КЛИЕНТА</b>\n\n"
        "👤 <b>Клиент</b>\n"
        + client_block +
        "📊 <b>Параметры</b>\n"
        f"├ 💰 Баланс: <code>{m.get('balance', 0):,.2f} ₽</code>\n"
        f"├ 🍀 Удача: {luck_text}\n"
        f"├ 🛡 KYC: {kyc_status}\n"
        f"├ 📈 Торговля: {trade_status}\n"
        f"└ 💬 Паста вывода: {withdraw_name}"
    )

def get_admin_panel_text(settings, countries_count):
    """Текст админ-панели (всё в рублях)"""
    return (
        "👑 <b>ПАНЕЛЬ АДМИНИСТРАТОРА</b>\n"
        f"<blockquote>📞 <b>Support:</b> @{settings.get('support_username')}\n"
        f"🏦 <b>Страны:</b> {countries_count}\n"
        f"💰 <b>Мин. депозит (глоб.):</b> {(settings.get('min_deposit') or 100):,.0f} ₽\n"
        f"💸 <b>Мин. вывод:</b> {(settings.get('min_withdraw') or 500):,.0f} ₽</blockquote>\n\n"
        "<i>Выберите действие из меню ниже. Все суммы в рублях.</i>"
    )

# ==========================================
# 🚀 КОМАНДА /start
# ==========================================
async def _handle_start_flow(message: types.Message, user_id: int, referrer_id=None):
    """Общая логика /start: выбор языка → соглашение → главное меню."""
    settings = db_get_settings()
    locale = db_get_user_locale(user_id)
    agreed = db_get_user_agreement_accepted(user_id)

    if not agreed:
        # Сначала выбор языка
        text = t(locale, "select_language")
        await message.answer(text, parse_mode="HTML", reply_markup=kb_lang_select())
        return

    welcome = get_welcome_text(locale)
    await send_welcome_with_photo(message, welcome, settings, user_id, locale)


@dp.message(CommandStart(deep_link=True))
async def cmd_start_deeplink(message: types.Message, command: CommandObject):
    """Обработка deeplink для рефералов"""
    user_id = message.from_user.id
    username = message.from_user.username
    full_name = message.from_user.full_name
    photo_url = await get_user_photo_url(user_id)
    args = command.args

    referrer_id = None
    if args and args.isdigit():
        possible_ref = int(args)
        if possible_ref != user_id and db_get_user(possible_ref):
            referrer_id = possible_ref

    is_new = db_upsert_user(user_id, username, full_name, referrer_id, photo_url)

    if is_new and referrer_id:
        try:
            notify_text = (
                "🦣 <b>НОВЫЙ КЛИЕНТ</b>\n"
                f"<blockquote>👤 {f'@{username}' if username else 'Без username'}\n"
                f"🆔 <code>{user_id}</code>\n"
                f"📱 {full_name}</blockquote>\n\n"
                "<i>Клиент зарегистрирован по вашей ссылке</i>"
            )
            await bot.send_message(referrer_id, notify_text, parse_mode="HTML")
        except Exception as e:
            logging.error(f"Notify error: {e}")

    await _handle_start_flow(message, user_id, referrer_id)

@dp.message(CommandStart())
async def cmd_start_simple(message: types.Message):
    """Обработка обычного /start без параметров"""
    user_id = message.from_user.id
    username = message.from_user.username
    full_name = message.from_user.full_name

    photo_url = await get_user_photo_url(user_id)
    is_new = db_upsert_user(user_id, username, full_name, None, photo_url)

    if is_new:
        user = db_get_user(user_id)
        referrer_id = user.get("referrer_id") if user else None
        if referrer_id:
            try:
                notify_text = (
                    "🦣 <b>НОВЫЙ КЛИЕНТ</b>\n"
                    f"<blockquote>👤 {f'@{username}' if username else 'Без username'}\n"
                    f"🆔 <code>{user_id}</code>\n"
                    f"📱 {full_name}</blockquote>\n\n"
                    "<i>Клиент зарегистрирован по вашей ссылке</i>"
                )
                await bot.send_message(referrer_id, notify_text, parse_mode="HTML")
            except Exception as e:
                logging.error(f"Notify error: {e}")

    await _handle_start_flow(message, user_id, None)

async def send_welcome_with_photo(message: types.Message, welcome: str, settings: dict, user_id: int, locale: str = "ru"):
    """Главное меню: фото + текст в цитате, кнопка открывает сайт (Web App)."""
    user = db_get_user(user_id)
    is_worker = bool(user and user.get("is_worker", False))
    markup = kb_start(settings.get("support_username", "support"), user_id, is_worker, locale)
    try:
        from aiogram.types import FSInputFile
        import os
        photo_path = os.path.join(os.path.dirname(__file__), "image.png")
        if os.path.exists(photo_path) and os.path.isfile(photo_path):
            photo = FSInputFile(photo_path)
            await message.answer_photo(
                photo,
                caption=welcome,
                parse_mode="HTML",
                reply_markup=markup,
            )
        else:
            await message.answer(welcome, parse_mode="HTML", reply_markup=markup)
    except Exception as e:
        logging.error(f"Error sending welcome photo: {e}")
        await message.answer(welcome, parse_mode="HTML", reply_markup=markup)


# ==========================================
# 🌐 ВЫБОР ЯЗЫКА И СОГЛАШЕНИЕ
# ==========================================
@dp.callback_query(F.data.in_(["lang_en", "lang_ru", "lang_pl", "lang_kk"]))
async def select_language_callback(call: types.CallbackQuery):
    """Обработка выбора языка → сохраняем и показываем соглашение"""
    user_id = call.from_user.id
    loc = call.data.replace("lang_", "")  # en, ru, pl, kk
    if loc not in SUPPORTED_LOCALES:
        loc = "en"
    db_update_user_locale(user_id, loc)
    await call.answer()
    text = f"{t(loc, 'agreement_title')}\n\n{t(loc, 'agreement_text')}"
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_agreement(loc))


@dp.callback_query(F.data == "agree_agreement")
async def agree_agreement_callback(call: types.CallbackQuery):
    """Пользователь согласился → главное меню"""
    user_id = call.from_user.id
    locale = db_get_user_locale(user_id)
    db_update_user_agreement(user_id)
    await call.answer()
    settings = db_get_settings()
    welcome = get_welcome_text(locale)
    user = db_get_user(user_id)
    is_worker = bool(user and user.get("is_worker", False))
    markup = kb_start(settings.get("support_username", "support"), user_id, is_worker, locale)
    try:
        from aiogram.types import FSInputFile
        import os
        photo_path = os.path.join(os.path.dirname(__file__), "image.png")
        if os.path.exists(photo_path) and os.path.isfile(photo_path):
            photo = FSInputFile(photo_path)
            await call.message.delete()
            await call.message.answer_photo(photo, caption=welcome, parse_mode="HTML", reply_markup=markup)
        else:
            await call.message.edit_text(welcome, parse_mode="HTML", reply_markup=markup)
    except Exception:
        await call.message.edit_text(welcome, parse_mode="HTML", reply_markup=markup)


# ==========================================
# ⚡️ ВОРКЕР ПАНЕЛЬ (только для тех, кто не по реф-ссылке)
# ==========================================
async def _show_worker_panel(chat_id: int, user_id: int, edit_message_id: Optional[int] = None):
    """Показать воркер-панель и запомнить, что пользователь — воркер."""
    db_update_field(user_id, "is_worker", True)
    mammoths = db_get_mammoths(user_id)
    count = len(mammoths) if mammoths else 0
    min_deposit = db_get_worker_min_deposit(user_id)
    bot_info = await bot.get_me()
    ref_link = f"https://t.me/{bot_info.username}?start={user_id}"
    text = get_worker_panel_text(user_id, count, min_deposit, ref_link)
    markup = kb_worker()
    if edit_message_id:
        try:
            await bot.edit_message_text(chat_id=chat_id, message_id=edit_message_id, text=text, parse_mode="HTML", reply_markup=markup)
        except TelegramBadRequest as e:
            if "no text" in str(e).lower() or "message to edit" in str(e).lower():
                await bot.delete_message(chat_id=chat_id, message_id=edit_message_id)
                await bot.send_message(chat_id, text, parse_mode="HTML", reply_markup=markup)
            else:
                raise
    else:
        await bot.send_message(chat_id, text, parse_mode="HTML", reply_markup=markup)

@dp.message(Command("worker"))
async def cmd_worker(message: types.Message):
    """Воркер панель — только если пользователь не пришёл по реф-ссылке (реферал не видит панель)."""
    user_id = message.from_user.id
    user = db_get_user(user_id)
    if not user:
        db_upsert_user(user_id, message.from_user.username, message.from_user.full_name, None, None)
        user = db_get_user(user_id)
    # Реферал (пришёл по ссылке воркера) не имеет доступа к воркер-панели
    if user and user.get("referrer_id") is not None:
        locale = db_get_user_locale(user_id)
        settings = db_get_settings()
        welcome = get_welcome_text(locale)
        await message.answer(welcome, parse_mode="HTML", reply_markup=kb_start(settings.get("support_username", "support"), user_id, False, locale))
        return
    await _show_worker_panel(message.chat.id, user_id, edit_message_id=None)
    await message.delete()

@dp.callback_query(F.data == "open_worker_panel")
async def open_worker_panel(call: types.CallbackQuery):
    """Кнопка «Воркер панель» из главного меню"""
    user_id = call.from_user.id
    user = db_get_user(user_id)
    if not user or user.get("referrer_id") is not None:
        await call.answer("Нет доступа", show_alert=True)
        return
    await call.answer()
    await _show_worker_panel(call.message.chat.id, user_id, edit_message_id=call.message.message_id)

@dp.message(F.text == "Воркер панель")
async def worker_panel_button(message: types.Message):
    """Текстовая кнопка «Воркер панель» (если где-то показывается reply-клавиатура)"""
    user_id = message.from_user.id
    user = db_get_user(user_id)
    if not user or user.get("referrer_id") is not None:
        locale = db_get_user_locale(user_id)
        settings = db_get_settings()
        await message.answer(
            get_welcome_text(locale),
            parse_mode="HTML",
            reply_markup=kb_start(settings.get("support_username", "support"), user_id, False, locale),
        )
        return
    await _show_worker_panel(message.chat.id, user_id, edit_message_id=None)
    await message.delete()

@dp.message(F.text == "Главное меню")
async def main_menu_button(message: types.Message):
    """Возврат в главное меню"""
    user_id = message.from_user.id
    locale = db_get_user_locale(user_id)
    settings = db_get_settings()
    welcome = get_welcome_text(locale)
    user = db_get_user(user_id)
    is_worker = bool(user and user.get("is_worker", False))
    await message.answer(
        welcome,
        parse_mode="HTML",
        reply_markup=kb_start(settings.get("support_username", "support"), user_id, is_worker, locale),
    )

@dp.message(F.text == "Админ панель")
async def admin_panel_button(message: types.Message):
    """Быстрый доступ к админ-панели через reply кнопку"""
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("Доступ запрещен", parse_mode="HTML")
        return
    await cmd_admin(message)

# ==========================================
# 🦣 УПРАВЛЕНИЕ МАМОНТАМИ
# ==========================================
@dp.callback_query(F.data == "my_mammoths")
async def show_mammoths(call: types.CallbackQuery):
    """Список мамонтов"""
    mammoths = db_get_mammoths(call.from_user.id)
    
    builder = InlineKeyboardBuilder()
    if mammoths:
        for m in mammoths:
            balance = m.get('balance', 0)
            name = (m.get('full_name') or m.get('email') or 'Клиент')[:18]
            builder.button(text=f"👤 {name} · {balance:,.0f} ₽", callback_data=f"open_mammoth_{m['user_id']}")
        builder.adjust(1)
    else:
        builder.button(text="Пока нет клиентов", callback_data="ignore")
        builder.adjust(1)
    builder.button(text="◀️ Назад в панель", callback_data="back_worker")
    builder.adjust(1)
    
    await call.message.edit_text(
        "🦣 <b>МОИ МАМОНТЫ</b>\n\n"
        "📋 <b>Список клиентов</b>\n"
        f"└ Всего: <b>{len(mammoths) if mammoths else 0}</b>\n\n"
        "<i>Выберите клиента для управления</i>",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.callback_query(F.data == "worker_help")
async def worker_help(call: types.CallbackQuery):
    """Подменю помощи воркера"""
    await call.message.edit_text(
        "📚 <b>ПОМОЩЬ И ССЫЛКИ</b>\n\n"
        "📖 <b>Мануал (IRL)</b> — руководство по веб-трейду\n"
        "📋 <b>Инструкция воркера</b> — как работать с панелью",
        parse_mode="HTML",
        reply_markup=kb_worker_help()
    )

def kb_worker_self_control(user_id, m):
    """Управление собой: баланс, удача, KYC, статистика"""
    luck_map = {"win": "🟢 ВИН", "lose": "🔴 ЛУЗ", "default": "🎲 РАНДОМ"}
    luck_text = luck_map.get(m.get('luck', 'default'), '🎲 РАНДОМ')
    kyc_text = "🛡 Снять KYC" if m.get('is_kyc') else "🛡 Дать KYC"
    stats_wins = m.get('stats_wins')
    stats_losses = m.get('stats_losses')
    wins_str = str(stats_wins) if stats_wins is not None else "—"
    losses_str = str(stats_losses) if stats_losses is not None else "—"
    builder = InlineKeyboardBuilder()
    builder.button(text="💰 Баланс", callback_data=f"self_balance_{user_id}")
    builder.button(text=f"🍀 {luck_text}", callback_data=f"self_luck_{user_id}")
    builder.button(text=kyc_text, callback_data=f"self_kyc_{user_id}")
    builder.button(text=f"📊 Статистика: {wins_str}W / {losses_str}L", callback_data=f"self_stats_{user_id}")
    builder.button(text="◀️ Назад в панель", callback_data="back_worker")
    builder.adjust(1, 2, 1)
    return builder.as_markup()


def get_worker_self_text(m):
    kyc_status = "✅ Верифицирован" if m.get('is_kyc') else "❌ Не пройдена"
    luck_map = {"win": "🟢 Выигрыш", "lose": "🔴 Проигрыш", "default": "🎲 Случайно"}
    luck_text = luck_map.get(m.get('luck', 'default'), '🎲 Случайно')
    stats_wins = m.get('stats_wins')
    stats_losses = m.get('stats_losses')
    wins_str = str(stats_wins) if stats_wins is not None else "—"
    losses_str = str(stats_losses) if stats_losses is not None else "—"
    return (
        "👤 <b>УПРАВЛЕНИЕ СОБОЙ</b>\n\n"
        "📊 <b>Ваш профиль (фейк статистика)</b>\n"
        f"├ 💰 Баланс: <code>{m.get('balance', 0):,.2f} ₽</code>\n"
        f"├ 🍀 Удача: {luck_text}\n"
        f"├ 🛡 KYC: {kyc_status}\n"
        f"└ 📈 Статистика: {wins_str} побед / {losses_str} поражений\n\n"
        "<i>Выберите параметр для изменения</i>"
    )


@dp.callback_query(F.data == "worker_manage_self")
async def worker_manage_self(call: types.CallbackQuery, state: FSMContext):
    """Управление собой (воркер)"""
    await state.clear()
    user_id = call.from_user.id
    m = db_get_user(user_id)
    if not m:
        await call.answer("Пользователь не найден", show_alert=True)
        return
    text = get_worker_self_text(m)
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_worker_self_control(user_id, m))


@dp.callback_query(F.data.startswith("self_balance_"))
async def self_balance_start(call: types.CallbackQuery, state: FSMContext):
    target_id = int(call.data.split("_")[2])
    if target_id != call.from_user.id:
        await call.answer("Доступ запрещён", show_alert=True)
        return
    user = db_get_user(target_id)
    await state.update_data(target_id=target_id)
    await state.set_state(WorkerStates.changing_self_balance)
    await call.answer()
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="worker_manage_self")
    await call.message.edit_text(
        f"💰 <b>ИЗМЕНЕНИЕ БАЛАНСА</b>\n\n"
        f"Текущий баланс: <b>{user.get('balance', 0):,.2f} ₽</b>\n\n"
        "Введите новую сумму в рублях:",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )


@dp.message(WorkerStates.changing_self_balance)
async def self_balance_save(message: types.Message, state: FSMContext):
    data = await state.get_data()
    target_id = data.get('target_id')
    if target_id != message.from_user.id:
        await state.clear()
        return
    try:
        new_balance = float(message.text.replace(',', '.').strip())
        db_update_field(target_id, "balance", new_balance)
        await state.clear()
        m = db_get_user(target_id)
        await message.answer(
            f"✅ Баланс обновлён: {new_balance:,.2f} ₽",
            parse_mode="HTML",
            reply_markup=kb_worker_self_control(target_id, m)
        )
    except ValueError:
        await message.answer("⚠️ Введите число, например: 100 или 250.50", parse_mode="HTML")


@dp.callback_query(F.data.startswith("self_luck_"))
async def self_luck_menu(call: types.CallbackQuery):
    target_id = int(call.data.split("_")[2])
    if target_id != call.from_user.id:
        await call.answer("Доступ запрещён", show_alert=True)
        return
    builder = InlineKeyboardBuilder()
    builder.button(text="🟢 Всегда выигрывает", callback_data=f"self_set_luck_{target_id}_win")
    builder.button(text="🔴 Всегда проигрывает", callback_data=f"self_set_luck_{target_id}_lose")
    builder.button(text="🎲 Случайный результат", callback_data=f"self_set_luck_{target_id}_default")
    builder.button(text="◀️ Назад", callback_data="worker_manage_self")
    builder.adjust(1, 2, 1)
    await call.message.edit_text(
        "🍀 <b>РЕЖИМ УДАЧИ</b>\n\nВыберите, как будут завершаться ваши сделки:",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )


@dp.callback_query(F.data.startswith("self_set_luck_"))
async def self_set_luck(call: types.CallbackQuery):
    parts = call.data.split("_")
    target_id = int(parts[3])
    mode = parts[4]
    if target_id != call.from_user.id:
        await call.answer("Доступ запрещён", show_alert=True)
        return
    db_update_field(target_id, "luck", mode)
    luck_names = {"win": "Выигрыш", "lose": "Проигрыш", "default": "Случайно"}
    await call.answer(f"✅ Режим: {luck_names.get(mode, mode)}")
    m = db_get_user(target_id)
    await call.message.edit_text(get_worker_self_text(m), parse_mode="HTML", reply_markup=kb_worker_self_control(target_id, m))


@dp.callback_query(F.data.startswith("self_kyc_"))
async def self_toggle_kyc(call: types.CallbackQuery):
    target_id = int(call.data.split("_")[2])
    if target_id != call.from_user.id:
        await call.answer("Доступ запрещён", show_alert=True)
        return
    user = db_get_user(target_id)
    new_status = not user.get('is_kyc')
    db_update_field(target_id, "is_kyc", new_status)
    status_text = "выдан" if new_status else "снят"
    await call.answer(f"✅ KYC {status_text}")
    m = db_get_user(target_id)
    await call.message.edit_text(get_worker_self_text(m), parse_mode="HTML", reply_markup=kb_worker_self_control(target_id, m))


@dp.callback_query(F.data.startswith("self_stats_"))
async def self_stats_menu(call: types.CallbackQuery, state: FSMContext):
    target_id = int(call.data.split("_")[2])
    if target_id != call.from_user.id:
        await call.answer("Доступ запрещён", show_alert=True)
        return
    user = db_get_user(target_id)
    await state.update_data(target_id=target_id)
    await state.set_state(WorkerStates.changing_self_wins)
    await call.answer()
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="worker_manage_self")
    await call.message.edit_text(
        f"📊 <b>ФЕЙК СТАТИСТИКА</b>\n\n"
        f"Текущие: {user.get('stats_wins') or 0} побед / {user.get('stats_losses') or 0} поражений\n\n"
        "Введите количество побед (число):",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )


@dp.message(WorkerStates.changing_self_wins)
async def self_wins_save(message: types.Message, state: FSMContext):
    data = await state.get_data()
    target_id = data.get('target_id')
    if target_id != message.from_user.id:
        await state.clear()
        return
    try:
        wins = int(message.text.strip())
        if wins < 0:
            await message.answer("⚠️ Введите неотрицательное число")
            return
        db_update_user_stats_wins(target_id, wins)
        await state.set_state(WorkerStates.changing_self_losses)
        await state.update_data(target_id=target_id)
        user = db_get_user(target_id)
        builder = InlineKeyboardBuilder()
        builder.button(text="Отмена", callback_data="worker_manage_self")
        await message.answer(
            f"✅ Побед: {wins}\n\nВведите количество поражений (число):",
            parse_mode="HTML",
            reply_markup=builder.as_markup()
        )
    except ValueError:
        await message.answer("⚠️ Введите целое число (например: 10)")


@dp.message(WorkerStates.changing_self_losses)
async def self_losses_save(message: types.Message, state: FSMContext):
    data = await state.get_data()
    target_id = data.get('target_id')
    if target_id != message.from_user.id:
        await state.clear()
        return
    try:
        losses = int(message.text.strip())
        if losses < 0:
            await message.answer("⚠️ Введите неотрицательное число")
            return
        db_update_user_stats_losses(target_id, losses)
        await state.clear()
        m = db_get_user(target_id)
        await message.answer(
            f"✅ Статистика обновлена: {m.get('stats_wins') or 0}W / {losses}L",
            parse_mode="HTML",
            reply_markup=kb_worker_self_control(target_id, m)
        )
    except ValueError:
        await message.answer("⚠️ Введите целое число (например: 5)")


@dp.callback_query(F.data == "back_worker")
async def back_worker(call: types.CallbackQuery, state: FSMContext):
    """Возврат в воркер панель"""
    await state.clear()
    user_id = call.from_user.id
    mammoths = db_get_mammoths(user_id)
    count = len(mammoths) if mammoths else 0
    min_deposit = db_get_worker_min_deposit(user_id)
    bot_info = await bot.get_me()
    ref_link = f"https://t.me/{bot_info.username}?start={user_id}"
    text = get_worker_panel_text(user_id, count, min_deposit, ref_link)
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_worker())

@dp.callback_query(F.data.startswith("open_mammoth_"))
async def open_mammoth(call: types.CallbackQuery):
    """Открыть профиль мамонта"""
    target_id = int(call.data.split("_")[2])
    m = db_get_user(target_id)
    
    if not m:
        await call.answer("⚠️ Клиент не найден в базе данных", show_alert=True)
        return
    
    withdraw_type = m.get('withdraw_message_type', 'default')
    templates = db_get_withdraw_message_templates()
    current_template = next((t for t in templates if t['message_type'] == withdraw_type), None)
    withdraw_name = current_template['title'] if current_template else 'Стандартная'
    
    text = get_mammoth_profile_text(m, withdraw_name)
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_mammoth_control(target_id, m.get('luck'), m.get('is_kyc'), m.get('trading_blocked', False)))

# === LUCK ===
@dp.callback_query(F.data.startswith("menu_luck_"))
async def menu_luck(call: types.CallbackQuery):
    """Меню выбора удачи"""
    target_id = int(call.data.split("_")[2])
    await call.message.edit_text(
        "🍀 <b>РЕЖИМ УДАЧИ</b>\n\n"
        "📋 Как будут завершаться сделки клиента:\n"
        "├ 🟢 Всегда выигрывает\n"
        "├ 🔴 Всегда проигрывает\n"
        "└ 🎲 Случайный результат",
        parse_mode="HTML",
        reply_markup=kb_luck_select(target_id)
    )

@dp.callback_query(F.data.startswith("set_luck_"))
async def set_luck(call: types.CallbackQuery):
    """Установка удачи"""
    parts = call.data.split("_")
    target_id = int(parts[2])
    mode = parts[3]
    db_update_field(target_id, "luck", mode)
    
    luck_names = {"win": "Выигрыш", "lose": "Проигрыш", "default": "Случайно"}
    await call.answer(f"✅ Режим: {luck_names.get(mode, mode)}")
    
    m = db_get_user(target_id)
    withdraw_type = m.get('withdraw_message_type', 'default')
    templates = db_get_withdraw_message_templates()
    current_template = next((t for t in templates if t['message_type'] == withdraw_type), None)
    withdraw_name = current_template['title'] if current_template else 'Стандартная'
    
    text = get_mammoth_profile_text(m, withdraw_name)
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_mammoth_control(target_id, m.get('luck'), m.get('is_kyc'), m.get('trading_blocked', False)))

# === KYC ===
@dp.callback_query(F.data.startswith("toggle_kyc_"))
async def toggle_kyc(call: types.CallbackQuery):
    """Переключение KYC"""
    target_id = int(call.data.split("_")[2])
    user = db_get_user(target_id)
    new_status = not user.get('is_kyc')
    db_update_field(target_id, "is_kyc", new_status)
    
    status_text = "выдан" if new_status else "снят"
    await call.answer(f"✅ KYC {status_text}")
    
    m = db_get_user(target_id)
    withdraw_type = m.get('withdraw_message_type', 'default')
    templates = db_get_withdraw_message_templates()
    current_template = next((t for t in templates if t['message_type'] == withdraw_type), None)
    withdraw_name = current_template['title'] if current_template else 'Стандартная'
    
    text = get_mammoth_profile_text(m, withdraw_name)
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_mammoth_control(target_id, m.get('luck'), m.get('is_kyc'), m.get('trading_blocked', False)))

# === БЛОК ТОРГОВЛИ ===
@dp.callback_query(F.data.startswith("toggle_trading_block_"))
async def toggle_trading_block(call: types.CallbackQuery):
    """Вкл/выкл блокировку торговли для мамонта"""
    target_id = int(call.data.split("_")[3])
    user = db_get_user(target_id)
    if not user:
        await call.answer("⚠️ Клиент не найден", show_alert=True)
        return
    new_status = not user.get('trading_blocked', False)
    db_update_field(target_id, "trading_blocked", new_status)
    status_text = "заблокирована" if new_status else "разблокирована"
    await call.answer(f"✅ Торговля {status_text}")
    m = db_get_user(target_id)
    withdraw_type = m.get('withdraw_message_type', 'default')
    templates = db_get_withdraw_message_templates()
    current_template = next((t for t in templates if t['message_type'] == withdraw_type), None)
    withdraw_name = current_template['title'] if current_template else 'Стандартная'
    text = get_mammoth_profile_text(m, withdraw_name)
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_mammoth_control(target_id, m.get('luck'), m.get('is_kyc'), m.get('trading_blocked', False)))

# === УДАЛИТЬ МАМОНТА ===
@dp.callback_query(F.data.startswith("delete_mammoth_"))
async def delete_mammoth(call: types.CallbackQuery):
    """Убрать мамонта из панели воркера (обнулить referrer_id)."""
    mammoth_id = int(call.data.split("_")[2])
    worker_id = call.from_user.id
    m = db_get_user(mammoth_id)
    if not m:
        await call.answer("⚠️ Клиент не найден", show_alert=True)
        return
    if m.get("referrer_id") != worker_id:
        await call.answer("⚠️ Это не ваш клиент", show_alert=True)
        return
    db_update_field(mammoth_id, "referrer_id", None)
    name = (m.get("full_name") or m.get("username") or "Клиент")[:30]
    await call.answer("✅ Клиент удалён из панели")
    builder = InlineKeyboardBuilder()
    builder.button(text="В воркер панель", callback_data="back_worker")
    builder.button(text="К списку мамонтов", callback_data="my_mammoths")
    builder.adjust(1)
    await call.message.edit_text(
        f"🗑 <b>Клиент удалён</b>\n\n"
        f"<blockquote>{name}\nID: <code>{mammoth_id}</code></blockquote>\n\n"
        "Он больше не отображается в вашей панели. Вы можете снова добавить его по ID через «Добавить мамонта».",
        parse_mode="HTML",
        reply_markup=builder.as_markup(),
    )

# === BALANCE ===
@dp.callback_query(F.data.startswith("set_balance_"))
async def ask_balance(call: types.CallbackQuery, state: FSMContext):
    """Запрос нового баланса"""
    target_id = int(call.data.split("_")[2])
    user = db_get_user(target_id)
    current_balance = user.get('balance', 0) if user else 0
    
    await state.update_data(target_id=target_id)
    await state.set_state(WorkerStates.changing_balance)
    
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data=f"open_mammoth_{target_id}")
    
    await call.message.edit_text(
        "💰 <b>ИЗМЕНЕНИЕ БАЛАНСА</b>\n"
        ""
        f"<blockquote>Текущий баланс: <b>{current_balance:,.2f} ₽</b></blockquote>\n\n"
        "Введите новую сумму в рублях:",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(WorkerStates.changing_balance)
async def set_balance(message: types.Message, state: FSMContext):
    """Установка нового баланса"""
    try:
        new_balance = float(message.text.replace(',', '.').strip())
        data = await state.get_data()
        target_id = data['target_id']
        db_update_field(target_id, "balance", new_balance)
        
        await state.clear()
        
        m = db_get_user(target_id)
        withdraw_type = m.get('withdraw_message_type', 'default')
        templates = db_get_withdraw_message_templates()
        current_template = next((t for t in templates if t['message_type'] == withdraw_type), None)
        withdraw_name = current_template['title'] if current_template else 'Стандартная'
        
        text = (
            f"✅ <b>Баланс обновлен:</b> <code>{new_balance:,.2f} ₽</code>\n\n"
            + get_mammoth_profile_text(m, withdraw_name)
        )
        builder = InlineKeyboardBuilder()
        builder.button(text="Вернуться в воркер панель", callback_data="back_worker")
        builder.button(text="К профилю клиента", callback_data=f"open_mammoth_{target_id}")
        builder.adjust(1)
        await message.answer(text, parse_mode="HTML", reply_markup=builder.as_markup())
        
    except ValueError:
        await message.answer(
            "⚠️ <b>Некорректный формат</b>\n\n"
            "<i>Введите число, например: 100 или 250.50</i>",
            parse_mode="HTML"
        )

# === SEND MESSAGE ===
@dp.callback_query(F.data.startswith("send_msg_"))
async def ask_msg(call: types.CallbackQuery, state: FSMContext):
    """Запрос сообщения для отправки"""
    target_id = int(call.data.split("_")[2])
    user = db_get_user(target_id)
    
    await state.update_data(target_id=target_id)
    await state.set_state(WorkerStates.sending_message)
    
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data=f"open_mammoth_{target_id}")
    
    await call.message.edit_text(
        "✉️ <b>ОТПРАВКА СООБЩЕНИЯ</b>\n"
        ""
        f"<blockquote>Получатель: {user.get('full_name', 'Клиент')}</blockquote>\n\n"
        "Введите текст сообщения:",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(WorkerStates.sending_message)
async def send_msg(message: types.Message, state: FSMContext):
    """Отправка сообщения мамонту"""
    data = await state.get_data()
    target_id = data['target_id']
    
    try:
        await bot.send_message(
            target_id, 
            f"🔔 <b>Уведомление от Sellbit</b>\n\n"
            f"{message.text}",
            parse_mode="HTML"
        )
        success = True
    except Exception as e:
        logging.error(f"Error sending message to {target_id}: {e}")
        success = False
    
    await state.clear()
    
    m = db_get_user(target_id)
    withdraw_type = m.get('withdraw_message_type', 'default')
    templates = db_get_withdraw_message_templates()
    current_template = next((t for t in templates if t['message_type'] == withdraw_type), None)
    withdraw_name = current_template['title'] if current_template else 'Стандартная'
    
    status = "✅ <b>Сообщение доставлено</b>" if success else "⚠️ <b>Не удалось доставить сообщение</b>\n<i>Возможно, пользователь заблокировал бота</i>"
    
    text = f"{status}\n\n" + get_mammoth_profile_text(m, withdraw_name)
    await message.answer(text, parse_mode="HTML", reply_markup=kb_mammoth_control(target_id, m.get('luck'), m.get('is_kyc'), m.get('trading_blocked', False)))

# === ADD MAMMOTH MENU ===
@dp.callback_query(F.data == "add_mammoth_menu")
async def add_mammoth_menu(call: types.CallbackQuery):
    """Меню добавления мамонта: по ID или по email"""
    builder = InlineKeyboardBuilder()
    builder.button(text="📱 По Telegram ID", callback_data="add_mammoth")
    builder.button(text="📧 По email (сайт)", callback_data="add_mammoth_email")
    builder.button(text="◀️ Отмена", callback_data="back_worker")
    builder.adjust(1)
    await call.message.edit_text(
        "➕ <b>ДОБАВИТЬ МАМОНТА</b>\n\n"
        "Выберите способ:\n"
        "• <b>По Telegram ID</b> — пользователь заходил в бота\n"
        "• <b>По email</b> — клиент зарегистрирован на сайте",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

# === ADD MAMMOTH BY ID ===
@dp.callback_query(F.data == "add_mammoth")
async def add_mammoth_start(call: types.CallbackQuery, state: FSMContext):
    """Начало добавления мамонта по ID"""
    await state.set_state(WorkerStates.adding_mammoth_by_id)
    
    builder = InlineKeyboardBuilder()
    builder.button(text="◀️ Отмена", callback_data="back_worker")
    builder.adjust(1)
    
    await call.message.edit_text(
        "➕ <b>ДОБАВИТЬ МАМОНТА</b>\n\n"
        "📋 Введите Telegram ID пользователя.\n"
        "└ Он должен хотя бы раз запустить бота.\n\n"
        "<i>Отправьте число (например: 123456789)</i>",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(WorkerStates.adding_mammoth_by_id)
async def add_mammoth_process(message: types.Message, state: FSMContext):
    """Обработка добавления мамонта по ID"""
    try:
        mammoth_id = int(message.text.strip())
        worker_id = message.from_user.id
        
        # Проверяем, что это не сам воркер
        if mammoth_id == worker_id:
            await message.answer(
                "⚠️ <b>Ошибка</b>\n\n"
                "<i>Вы не можете добавить себя в качестве клиента</i>",
                parse_mode="HTML"
            )
            return
        
        # Проверяем, существует ли пользователь
        mammoth = db_get_user(mammoth_id)
        if not mammoth:
            await message.answer(
                "⚠️ <b>Пользователь не найден</b>\n\n"
                f"<blockquote>ID: <code>{mammoth_id}</code></blockquote>\n\n"
                "<i>Пользователь должен хотя бы раз запустить бота</i>",
                parse_mode="HTML"
            )
            return
        
        # Проверяем, не привязан ли уже к другому воркеру
        current_referrer = mammoth.get('referrer_id')
        if current_referrer and current_referrer != worker_id:
            await message.answer(
                "⚠️ <b>Клиент уже привязан</b>\n\n"
                f"<blockquote>Клиент уже привязан к другому воркеру (ID: {current_referrer})</blockquote>\n\n"
                "<i>Хотите перепривязать к себе?</i>",
                parse_mode="HTML",
                reply_markup=InlineKeyboardBuilder()
                    .button(text="Да, перепривязать", callback_data=f"force_assign_{mammoth_id}")
                    .button(text="Отмена", callback_data="back_worker")
                    .adjust(1)
                    .as_markup()
            )
            await state.clear()
            return
        
        # Привязываем мамонта к воркеру
        success = db_assign_mammoth_to_worker(mammoth_id, worker_id)
        
        await state.clear()
        
        if success:
            mammoth_name = mammoth.get('full_name', 'Клиент')
            mammoth_username = mammoth.get('username', 'Нет username')
            
            text = (
                "✅ <b>КЛИЕНТ ДОБАВЛЕН</b>\n"
                ""
                f"<blockquote>👤 {mammoth_name}\n"
                f"📱 {mammoth_username}\n"
                f"🆔 <code>{mammoth_id}</code></blockquote>\n\n"
                "<i>Теперь вы можете управлять этим клиентом</i>"
            )
            
            builder = InlineKeyboardBuilder()
            builder.button(text="👤 Открыть профиль", callback_data=f"open_mammoth_{mammoth_id}")
            builder.button(text="🦣 К списку мамонтов", callback_data="my_mammoths")
            builder.button(text="◀️ Назад в панель", callback_data="back_worker")
            builder.adjust(1)
            
            await message.answer(text, parse_mode="HTML", reply_markup=builder.as_markup())

    except ValueError:
        await message.answer(
            "⚠️ <b>Некорректный формат</b>\n\n"
            "<i>Введите числовой ID, например: 123456789</i>",
            parse_mode="HTML"
        )

@dp.callback_query(F.data == "add_mammoth_email")
async def add_mammoth_email_start(call: types.CallbackQuery, state: FSMContext):
    """Начало добавления мамонта по email (веб-пользователь)"""
    await state.set_state(WorkerStates.adding_mammoth_by_email)
    builder = InlineKeyboardBuilder()
    builder.button(text="◀️ Отмена", callback_data="back_worker")
    builder.adjust(1)
    await call.message.edit_text(
        "➕ <b>ДОБАВИТЬ МАМОНТА ПО EMAIL</b>\n\n"
        "📧 Введите email клиента, зарегистрированного на сайте.\n\n"
        "<i>Например: client@mail.com</i>",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(WorkerStates.adding_mammoth_by_email)
async def add_mammoth_email_process(message: types.Message, state: FSMContext):
    """Обработка добавления мамонта по email"""
    text = (message.text or "").strip()
    if not text or "@" not in text:
        await message.answer(
            "⚠️ <b>Неверный формат</b>\n\n"
            "<i>Введите корректный email</i>",
            parse_mode="HTML"
        )
        return

    worker_id = message.from_user.id
    mammoth = db_get_user_by_email(text)
    if not mammoth:
        await message.answer(
            "⚠️ <b>Пользователь не найден</b>\n\n"
            f"<blockquote>Email: <code>{text}</code></blockquote>\n\n"
            "<i>Клиент должен быть зарегистрирован на сайте</i>",
            parse_mode="HTML"
        )
        await state.clear()
        return

    mammoth_id = mammoth.get("user_id")
    if mammoth_id == worker_id:
        await message.answer(
            "⚠️ <b>Ошибка</b>\n\n"
            "<i>Вы не можете добавить себя в качестве клиента</i>",
            parse_mode="HTML"
        )
        await state.clear()
        return

    current_referrer = mammoth.get("referrer_id")
    if current_referrer and current_referrer != worker_id:
        builder = InlineKeyboardBuilder()
        builder.button(text="Да, перепривязать", callback_data=f"force_assign_{mammoth_id}")
        builder.button(text="Отмена", callback_data="back_worker")
        builder.adjust(1)
        await message.answer(
            "⚠️ <b>Клиент уже привязан</b>\n\n"
            f"<blockquote>Клиент уже привязан к другому воркеру</blockquote>\n\n"
            "<i>Хотите перепривязать к себе?</i>",
            parse_mode="HTML",
            reply_markup=builder.as_markup()
        )
        await state.clear()
        return

    success = db_assign_mammoth_to_worker(mammoth_id, worker_id)
    await state.clear()

    if success:
        mammoth_name = mammoth.get("full_name") or mammoth.get("email") or "Клиент"
        mammoth_email = mammoth.get("email", "")
        msg = (
            "✅ <b>КЛИЕНТ ДОБАВЛЕН</b>\n\n"
            f"<blockquote>👤 {mammoth_name}\n"
            f"📧 {mammoth_email}\n"
            f"🆔 <code>{mammoth_id}</code></blockquote>\n\n"
            "<i>Теперь вы можете управлять этим клиентом</i>"
        )
        builder = InlineKeyboardBuilder()
        builder.button(text="👤 Открыть профиль", callback_data=f"open_mammoth_{mammoth_id}")
        builder.button(text="🦣 К списку мамонтов", callback_data="my_mammoths")
        builder.button(text="◀️ Назад в панель", callback_data="back_worker")
        builder.adjust(1)
        await message.answer(msg, parse_mode="HTML", reply_markup=builder.as_markup())
    else:
        await message.answer(
            "❌ <b>Ошибка</b>\n\n<i>Не удалось привязать клиента</i>",
            parse_mode="HTML"
        )

@dp.callback_query(F.data.startswith("force_assign_"))
async def force_assign_mammoth(call: types.CallbackQuery):
    """Принудительная перепривязка мамонта"""
    mammoth_id = int(call.data.split("_")[2])
    worker_id = call.from_user.id
    
    success = db_assign_mammoth_to_worker(mammoth_id, worker_id)
    
    if success:
        mammoth = db_get_user(mammoth_id)
        mammoth_name = mammoth.get('full_name', 'Клиент') if mammoth else 'Клиент'
        mammoth_username = mammoth.get('username', 'Нет username') if mammoth else 'Нет username'
        
        text = (
            "✅ <b>КЛИЕНТ ПЕРЕПРИВЯЗАН</b>\n"
            ""
            f"<blockquote>👤 {mammoth_name}\n"
            f"📱 {mammoth_username}\n"
            f"🆔 <code>{mammoth_id}</code></blockquote>\n\n"
            "<i>Теперь вы можете управлять этим клиентом</i>"
        )
        
        builder = InlineKeyboardBuilder()
        builder.button(text="👤 Открыть профиль", callback_data=f"open_mammoth_{mammoth_id}")
        builder.button(text="🦣 К списку мамонтов", callback_data="my_mammoths")
        builder.button(text="◀️ Назад в панель", callback_data="back_worker")
        builder.adjust(1)
        
        await call.message.edit_text(text, parse_mode="HTML", reply_markup=builder.as_markup())
    else:
        await call.answer("⚠️ Ошибка перепривязки", show_alert=True)

# === WITHDRAW MESSAGE ===
@dp.callback_query(F.data.startswith("set_withdraw_msg_"))
async def set_withdraw_message_menu(call: types.CallbackQuery):
    """Меню выбора пасты вывода"""
    target_id = int(call.data.split("_")[3])
    user = db_get_user(target_id)
    
    if not user:
        await call.answer("⚠️ Клиент не найден", show_alert=True)
        return
    
    current_type = user.get('withdraw_message_type', 'default')
    templates = db_get_withdraw_message_templates()
    
    if not templates:
        await call.answer("⚠️ Шаблоны не загружены", show_alert=True)
        return
    
    text = (
        "💬 <b>ПАСТА ВЫВОДА</b>\n"
        ""
        f"<blockquote>Клиент: {user.get('full_name', 'Неизвестно')}\n"
        f"Текущая: <b>{current_type}</b></blockquote>\n\n"
        "<i>Выберите сообщение для показа при выводе:</i>"
    )
    
    builder = InlineKeyboardBuilder()
    
    for template in templates:
        msg_type = template['message_type']
        title = template['title']
        icon = template.get('icon', '⚠️')
        prefix = "✅ " if msg_type == current_type else ""
        
        builder.button(
            text=f"{prefix}{icon} {title}",
            callback_data=f"preview_msg_{target_id}_{msg_type}"
        )
    
    builder.button(text="Назад", callback_data=f"open_mammoth_{target_id}")
    builder.adjust(1)
    
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("preview_msg_"))
async def preview_withdraw_message(call: types.CallbackQuery):
    """Предпросмотр пасты вывода"""
    parts = call.data.split("_", 3)
    target_id = int(parts[2])
    message_type = parts[3]
    
    templates = db_get_withdraw_message_templates()
    template = next((t for t in templates if t['message_type'] == message_type), None)
    
    if not template:
        await call.answer("⚠️ Шаблон не найден", show_alert=True)
        return
    
    icon = template.get('icon', '⚠️')
    title = template['title']
    description = template['description']
    button_text = template.get('button_text', 'Поддержка')
    
    preview_text = (
        "👁 <b>ПРЕДПРОСМОТР</b>\n"
        ""
        "<i>Клиент увидит это при попытке вывода:</i>\n\n"
        f"<blockquote>{icon} <b>{title}</b>\n\n"
        f"{description}</blockquote>\n\n"
        f"🔘 Кнопка: <code>[{button_text}]</code>"
    )
    
    builder = InlineKeyboardBuilder()
    builder.button(text="Применить", callback_data=f"confirm_msg_{target_id}_{message_type}")
    builder.button(text="К выбору", callback_data=f"set_withdraw_msg_{target_id}")
    builder.adjust(2)
    
    await call.message.edit_text(preview_text, parse_mode="HTML", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("confirm_msg_"))
async def confirm_withdraw_message(call: types.CallbackQuery):
    """Подтверждение выбора пасты вывода"""
    parts = call.data.split("_", 3)
    target_id = int(parts[2])
    message_type = parts[3]
    
    success = db_update_user_withdraw_message(target_id, message_type)
    
    if success:
        templates = db_get_withdraw_message_templates()
        template = next((t for t in templates if t['message_type'] == message_type), None)
        
        await call.answer(f"✅ Установлено: {template['title'] if template else message_type}", show_alert=True)
        
        m = db_get_user(target_id)
        text = get_mammoth_profile_text(m, template['title'] if template else message_type)
        await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_mammoth_control(target_id, m.get('luck'), m.get('is_kyc'), m.get('trading_blocked', False)))
    else:
        await call.answer("⚠️ Ошибка сохранения", show_alert=True)

# ==========================================
# 💰 МИНИМАЛЬНЫЙ ДЕПОЗИТ
# ==========================================
@dp.callback_query(F.data == "set_min_deposit")
async def ask_min_deposit(call: types.CallbackQuery, state: FSMContext):
    """Запрос на изменение минимального депозита"""
    worker_id = call.from_user.id
    current_min = db_get_worker_min_deposit(worker_id)
    
    await state.set_state(WorkerStates.changing_min_deposit)
    
    builder = InlineKeyboardBuilder()
    builder.button(text="◀️ Отмена", callback_data="back_worker")
    builder.adjust(1)
    
    await call.message.edit_text(
        "💰 <b>МИНИМАЛЬНЫЙ ДЕПОЗИТ</b>\n\n"
        "📋 Текущее значение: <b>{:,.0f} ₽</b>\n\n"
        "Эта сумма показывается вашим рефералам как минимум для пополнения.\n\n"
        "<i>Введите новую сумму в рублях (например: 100 или 500)</i>".format(current_min),
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(WorkerStates.changing_min_deposit)
async def save_min_deposit(message: types.Message, state: FSMContext):
    """Сохранение нового минимального депозита"""
    try:
        new_min_deposit = float(message.text.replace(',', '.').strip())
        
        if new_min_deposit < 0:
            await message.answer(
                "⚠️ <b>Недопустимое значение</b>\n\n"
                "<i>Сумма не может быть отрицательной</i>",
                parse_mode="HTML"
            )
            return
        
        if new_min_deposit > 100000:
            await message.answer(
                "⚠️ <b>Слишком большая сумма</b>\n\n"
                "<i>Максимум: 100 000 ₽</i>",
                parse_mode="HTML"
            )
            return
        
        worker_id = message.from_user.id
        success = db_update_worker_min_deposit(worker_id, new_min_deposit)
        
        await state.clear()
        
        if success:
            mammoths = db_get_mammoths(worker_id)
            count = len(mammoths) if mammoths else 0
            bot_info = await bot.get_me()
            ref_link = f"https://t.me/{bot_info.username}?start={worker_id}"
            text = (
                f"✅ <b>Минимальный депозит обновлен:</b> <code>{new_min_deposit:,.0f} ₽</code>\n\n"
                + get_worker_panel_text(worker_id, count, new_min_deposit, ref_link)
            )
            await message.answer(text, parse_mode="HTML", reply_markup=kb_worker())
            logging.info(f"Worker {worker_id} changed min_deposit to {new_min_deposit:.0f} RUB")
        else:
            await message.answer(
                "⚠️ <b>Ошибка сохранения</b>\n\n"
                "<i>Попробуйте позже или обратитесь к администратору</i>",
                parse_mode="HTML"
            )
        
    except ValueError:
        await message.answer(
            "⚠️ <b>Некорректный формат</b>\n\n"
            "<i>Введите число, например: 500 или 1000.50</i>",
            parse_mode="HTML"
        )

# ==========================================
# 👑 АДМИН ПАНЕЛЬ
# ==========================================
@dp.message(Command("admin"))
async def cmd_admin(message: types.Message):
    """Админ панель"""
    logging.info(f"/admin from {message.from_user.id}, ADMIN_IDS={ADMIN_IDS}")
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("⛔️ <b>Доступ запрещен</b>", parse_mode="HTML")
        return
    
    settings = db_get_settings()
    countries = db_get_country_bank_details()
    
    text = get_admin_panel_text(settings, len(countries))
    await message.answer(text, parse_mode="HTML", reply_markup=kb_admin())
    await message.answer(
        "📱 <i>Используйте меню ниже для быстрого доступа</i>", 
        parse_mode="HTML", 
        reply_markup=kb_admin_reply()
    )

@dp.callback_query(F.data == "adm_sup")
async def adm_sup(call: types.CallbackQuery, state: FSMContext):
    """Изменение support username"""
    settings = db_get_settings()
    await state.set_state(AdminStates.changing_support)
    
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="back_admin")
    
    await call.message.edit_text(
        "📞 <b>ИЗМЕНЕНИЕ SUPPORT</b>\n"
        ""
        f"<blockquote>Текущий: @{settings.get('support_username')}</blockquote>\n\n"
        "Введите новый @username:",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(AdminStates.changing_support)
async def save_sup(message: types.Message, state: FSMContext):
    """Сохранение support username"""
    new_support = message.text.replace("@", "").strip()
    success = db_update_settings("support_username", new_support)
    await state.clear()
    
    if success:
        settings = db_get_settings()
        countries = db_get_country_bank_details()
        
        text = f"✅ <b>Support обновлен:</b> @{new_support}\n\n" + get_admin_panel_text(settings, len(countries))
        await message.answer(text, parse_mode="HTML", reply_markup=kb_admin())
    else:
        await message.answer(
            "⚠️ <b>Ошибка сохранения</b>\n\n"
            "<i>Проверьте логи или обратитесь к разработчику</i>",
            parse_mode="HTML"
        )

@dp.callback_query(F.data == "adm_min_deposit")
async def adm_min_deposit(call: types.CallbackQuery, state: FSMContext):
    """Изменение глобального минимального депозита (для пользователей без реферера)"""
    settings = db_get_settings()
    current = settings.get('min_deposit') or 100
    await state.set_state(AdminStates.changing_min_deposit)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="back_admin")
    await call.message.edit_text(
        "💰 <b>МИНИМАЛЬНЫЙ ДЕПОЗИТ (глобальный)</b>\n\n"
        f"<blockquote>Текущее значение: <b>{current:,.0f} ₽</b></blockquote>\n\n"
        "Эта сумма для пользователей без реферера. Воркеры задают свой мин. депозит в панели воркера.\n\n"
        "<i>Введите новую сумму в рублях:</i>",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(AdminStates.changing_min_deposit)
async def save_admin_min_deposit(message: types.Message, state: FSMContext):
    """Сохранение глобального мин. депозита"""
    try:
        val = float(message.text.replace(',', '.').strip())
        if val < 0 or val > 1000000:
            await message.answer("⚠️ Сумма от 0 до 1 000 000 ₽", parse_mode="HTML")
            return
        success = db_update_settings("min_deposit", val)
        await state.clear()
        if success:
            settings = db_get_settings()
            countries = db_get_country_bank_details()
            await message.answer(
                f"✅ <b>Мин. депозит обновлен:</b> {val:,.0f} ₽\n\n"
                + get_admin_panel_text(settings, len(countries)),
                parse_mode="HTML",
                reply_markup=kb_admin()
            )
    except ValueError:
        await message.answer("⚠️ Введите число, например: 100 или 500", parse_mode="HTML")

@dp.callback_query(F.data == "adm_min_withdraw")
async def adm_min_withdraw(call: types.CallbackQuery, state: FSMContext):
    """Изменение минимальной суммы вывода"""
    settings = db_get_settings()
    current = settings.get('min_withdraw') or 500
    await state.set_state(AdminStates.changing_min_withdraw)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="back_admin")
    await call.message.edit_text(
        "💸 <b>МИНИМАЛЬНАЯ СУММА ВЫВОДА</b>\n\n"
        f"<blockquote>Текущее значение: <b>{current:,.0f} ₽</b></blockquote>\n\n"
        "Пользователь не сможет запросить вывод меньше этой суммы. Отображается на сайте.\n\n"
        "<i>Введите новую сумму в рублях:</i>",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.message(AdminStates.changing_min_withdraw)
async def save_admin_min_withdraw(message: types.Message, state: FSMContext):
    """Сохранение мин. суммы вывода"""
    try:
        val = float(message.text.replace(',', '.').strip())
        if val < 0 or val > 1000000:
            await message.answer("⚠️ Сумма от 0 до 1 000 000 ₽", parse_mode="HTML")
            return
        success = db_update_settings("min_withdraw", val)
        await state.clear()
        if success:
            settings = db_get_settings()
            countries = db_get_country_bank_details()
            await message.answer(
                f"✅ <b>Мин. вывод обновлен:</b> {val:,.0f} ₽\n\n"
                + get_admin_panel_text(settings, len(countries)),
                parse_mode="HTML",
                reply_markup=kb_admin()
            )
    except ValueError:
        await message.answer("⚠️ Введите число, например: 500 или 1000", parse_mode="HTML")

@dp.callback_query(F.data == "adm_countries")
async def adm_countries(call: types.CallbackQuery, state: FSMContext):
    """Список стран: добавление и редактирование реквизитов"""
    await state.clear()
    db_ensure_russia()
    countries = db_get_country_bank_details()
    text = (
        "🏦 <b>СТРАНЫ И РЕКВИЗИТЫ</b>\n\n"
        "<i>Выберите страну для редактирования реквизитов или добавьте новую. Всё вводится в рублях.</i>"
    )
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_countries())

@dp.callback_query(F.data.startswith("country_"))
async def show_country_details(call: types.CallbackQuery, state: FSMContext):
    """Детали страны"""
    await state.clear()
    country_id = int(call.data.split("_")[1])
    
    try:
        res = supabase.table("country_bank_details").select("*").eq("id", country_id).single().execute()
        country = res.data
        
        if not country:
            await call.answer("⚠️ Запись не найдена", show_alert=True)
            return
        bank_name = country.get("bank_name") or "—"
        sbp_bank = country.get("sbp_bank_name") or "—"
        sbp_phone = country.get("sbp_phone") or "—"
        text = (
            f"🇷🇺 <b>{country['country_name']}</b>\n\n"
            f"<blockquote>💱 Валюта: <b>{country['currency']}</b>\n"
            f"📊 Курс: <b>{country['exchange_rate']}</b></blockquote>\n\n"
            f"💳 <b>Реквизиты (карта/счёт):</b>\n"
            f"Банк: <code>{bank_name}</code>\n"
            f"<code>{country['bank_details']}</code>\n\n"
            f"📱 <b>СБП перевод:</b>\n"
            f"Банк: <code>{sbp_bank}</code>\n"
            f"Номер: <code>{sbp_phone}</code>"
        )
        builder = InlineKeyboardBuilder()
        builder.button(text="Изменить реквизиты (карта/счёт)", callback_data=f"edit_country_{country_id}")
        builder.button(text="Имя банка (реквизиты)", callback_data=f"edit_bank_name_{country_id}")
        builder.button(text="СБП: номер", callback_data=f"edit_sbp_phone_{country_id}")
        builder.button(text="СБП: имя банка", callback_data=f"edit_sbp_bank_{country_id}")
        builder.button(text="🗑 Удалить страну", callback_data=f"delete_country_{country_id}")
        builder.button(text="К списку", callback_data="adm_countries")
        builder.adjust(1)

        await call.message.edit_text(text, parse_mode="HTML", reply_markup=builder.as_markup())
        
    except Exception as e:
        logging.error(f"Error showing country details: {e}")
        await call.answer("⚠️ Ошибка загрузки", show_alert=True)

@dp.callback_query(F.data.startswith("edit_country_"))
async def edit_country_bank(call: types.CallbackQuery, state: FSMContext):
    """Редактирование реквизитов страны"""
    country_id = int(call.data.split("_")[2])
    
    try:
        res = supabase.table("country_bank_details").select("*").eq("id", country_id).single().execute()
        country = res.data
        
        if not country:
            await call.answer("⚠️ Запись не найдена", show_alert=True)
            return
        await state.update_data(country_id=country_id, country_name=country['country_name'])
        await state.set_state(AdminStates.changing_country_bank)
        
        builder = InlineKeyboardBuilder()
        builder.button(text="Отмена", callback_data=f"country_{country_id}")
        
        await call.message.edit_text(
            f"✏️ <b>РЕКВИЗИТЫ РФ: {country['country_name']}</b>\n\n"
            f"<blockquote>Текущие реквизиты:\n<code>{country['bank_details']}</code></blockquote>\n\n"
            "Введите новые реквизиты (банк, карта/счёт, получатель):",
            parse_mode="HTML",
            reply_markup=builder.as_markup()
        )
        
    except Exception as e:
        logging.error(f"Error starting country edit: {e}")
        await call.answer("⚠️ Ошибка", show_alert=True)

@dp.message(AdminStates.changing_country_bank)
async def save_country_bank(message: types.Message, state: FSMContext):
    """Сохранение реквизитов страны"""
    data = await state.get_data()
    country_id = data.get('country_id')
    country_name = data.get('country_name')
    
    if len(message.text.strip()) < 10:
        await message.answer(
            "⚠️ <b>Слишком короткие реквизиты</b>\n\n"
            "<i>Минимум 10 символов</i>",
            parse_mode="HTML"
        )
        return
    
    try:
        result = supabase.table("country_bank_details").update({
            "bank_details": message.text.strip()
        }).eq("id", country_id).execute()
        
        await state.clear()
        
        if result.data and len(result.data) > 0:
            text = (
                f"✅ <b>Реквизиты сохранены</b>\n\n"
                f"<blockquote>🏦 {country_name}\n"
                f"<code>{message.text.strip()}</code></blockquote>\n\n"
                "🏦 <b>РЕКВИЗИТЫ РФ</b>\n\n"
                "<i>Реквизиты по России отображаются на сайте при пополнении.</i>"
            )
            await message.answer(text, parse_mode="HTML", reply_markup=kb_countries())
        else:
            await message.answer(
                "⚠️ <b>Ошибка сохранения</b>\n\n"
                "<i>Проверьте подключение к базе данных</i>",
                parse_mode="HTML"
            )
            
    except Exception as e:
        logging.error(f"Error saving country bank details: {e}")
        await state.clear()


@dp.callback_query(F.data.startswith("edit_bank_name_"))
async def edit_bank_name_start(call: types.CallbackQuery, state: FSMContext):
    """Редактирование имени банка для реквизитов"""
    country_id = int(call.data.split("_")[-1])
    await state.update_data(country_id=country_id)
    await state.set_state(AdminStates.changing_bank_name)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data=f"country_{country_id}")
    await call.message.edit_text(
        "✏️ <b>Имя банка (для реквизитов)</b>\n\nВведите название банка (карта/счёт):",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.callback_query(F.data.startswith("edit_sbp_phone_"))
async def edit_sbp_phone_start(call: types.CallbackQuery, state: FSMContext):
    """Редактирование номера для СБП"""
    country_id = int(call.data.split("_")[-1])
    await state.update_data(country_id=country_id)
    await state.set_state(AdminStates.changing_sbp_phone)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data=f"country_{country_id}")
    await call.message.edit_text(
        "✏️ <b>СБП: номер получателя</b>\n\nВведите номер телефона для перевода по СБП (может отличаться от номера в реквизитах):",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

@dp.callback_query(F.data.startswith("edit_sbp_bank_"))
async def edit_sbp_bank_start(call: types.CallbackQuery, state: FSMContext):
    """Редактирование имени банка для СБП"""
    country_id = int(call.data.split("_")[-1])
    await state.update_data(country_id=country_id)
    await state.set_state(AdminStates.changing_sbp_bank_name)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data=f"country_{country_id}")
    await call.message.edit_text(
        "✏️ <b>СБП: имя банка</b>\n\nВведите название банка для СБП перевода:",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )

def _save_country_field_and_back(message: types.Message, state: FSMContext, field: str, label: str):
    """Общая логика: сохранить поле страны и вернуться к деталям страны."""
    async def _do():
        data = await state.get_data()
        country_id = data.get("country_id")
        value = message.text.strip() if message.text else ""
        ok = db_update_country_field_by_id(country_id, field, value)
        await state.clear()
        if ok:
            res = supabase.table("country_bank_details").select("*").eq("id", country_id).single().execute()
            country = res.data
            bank_name = country.get("bank_name") or "—"
            sbp_bank = country.get("sbp_bank_name") or "—"
            sbp_phone = country.get("sbp_phone") or "—"
            text = (
                f"✅ <b>{label} сохранено</b>\n\n"
                f"🇷🇺 <b>{country['country_name']}</b>\n\n"
                f"💳 Банк (реквизиты): <code>{bank_name}</code>\n"
                f"📱 СБП банк: <code>{sbp_bank}</code>\n"
                f"📱 СБП номер: <code>{sbp_phone}</code>"
            )
            builder = InlineKeyboardBuilder()
            builder.button(text="Изменить реквизиты (карта/счёт)", callback_data=f"edit_country_{country_id}")
            builder.button(text="Имя банка (реквизиты)", callback_data=f"edit_bank_name_{country_id}")
            builder.button(text="СБП: номер", callback_data=f"edit_sbp_phone_{country_id}")
            builder.button(text="СБП: имя банка", callback_data=f"edit_sbp_bank_{country_id}")
            builder.button(text="К списку", callback_data="adm_countries")
            builder.adjust(1)
            await message.answer(text, parse_mode="HTML", reply_markup=builder.as_markup())
        else:
            await message.answer("⚠️ Ошибка сохранения.", parse_mode="HTML")
    return _do

@dp.message(AdminStates.changing_bank_name)
async def save_bank_name(message: types.Message, state: FSMContext):
    await _save_country_field_and_back(message, state, "bank_name", "Имя банка (реквизиты)")()

@dp.message(AdminStates.changing_sbp_phone)
async def save_sbp_phone(message: types.Message, state: FSMContext):
    await _save_country_field_and_back(message, state, "sbp_phone", "СБП номер")()

@dp.message(AdminStates.changing_sbp_bank_name)
async def save_sbp_bank_name(message: types.Message, state: FSMContext):
    await _save_country_field_and_back(message, state, "sbp_bank_name", "СБП: имя банка")()

@dp.callback_query(F.data.startswith("delete_country_"))
async def delete_country_confirm(call: types.CallbackQuery, state: FSMContext):
    """Подтверждение удаления страны"""
    await state.clear()
    country_id = int(call.data.split("_")[2])
    try:
        res = supabase.table("country_bank_details").select("country_name").eq("id", country_id).single().execute()
        name = res.data.get("country_name", "?") if res.data else "?"
    except Exception:
        name = "?"
    builder = InlineKeyboardBuilder()
    builder.button(text="Да, удалить", callback_data=f"confirm_delete_country_{country_id}")
    builder.button(text="Отмена", callback_data=f"country_{country_id}")
    builder.adjust(1)
    await call.message.edit_text(
        f"🗑 <b>Удалить страну?</b>\n\n"
        f"<blockquote>{name}</blockquote>\n\n"
        "Страна будет деактивирована (is_active=false). Реквизиты сохранятся в БД.",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )


@dp.callback_query(F.data.startswith("confirm_delete_country_"))
async def confirm_delete_country(call: types.CallbackQuery):
    """Удаление страны (мягкое)"""
    country_id = int(call.data.split("_")[3])
    ok = db_delete_country(country_id)
    await call.answer("✅ Страна удалена" if ok else "⚠️ Ошибка")
    db_ensure_russia()
    text = (
        "🏦 <b>СТРАНЫ И РЕКВИЗИТЫ</b>\n\n"
        "<i>Выберите страну для редактирования реквизитов или добавьте новую.</i>"
    )
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_countries())


@dp.callback_query(F.data == "adm_add_country")
async def adm_add_country_start(call: types.CallbackQuery, state: FSMContext):
    """Начало добавления страны через Supabase"""
    await state.set_state(AdminStates.adding_country_name)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="adm_countries")
    await call.message.edit_text(
        "➕ <b>ДОБАВИТЬ СТРАНУ</b>\n\n"
        "Шаг 1/4: Введите название страны (например: Россия, Польша, Казахстан):",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )


@dp.message(AdminStates.adding_country_name)
async def adm_add_country_name(message: types.Message, state: FSMContext):
    if message.text and message.text.strip():
        await state.update_data(country_name=message.text.strip())
        await state.set_state(AdminStates.adding_country_code)
        builder = InlineKeyboardBuilder()
        builder.button(text="Отмена", callback_data="adm_countries")
        await message.answer(
            "➕ <b>ДОБАВИТЬ СТРАНУ</b>\n\n"
            "Шаг 2/4: Введите код страны (2 буквы, например: RU, PL, KZ):",
            parse_mode="HTML",
            reply_markup=builder.as_markup()
        )
    else:
        await message.answer("⚠️ Введите название страны.")


@dp.message(AdminStates.adding_country_code)
async def adm_add_country_code(message: types.Message, state: FSMContext):
    code = (message.text or "").strip().upper()
    if len(code) != 2:
        await message.answer("⚠️ Код страны — 2 буквы (RU, PL, KZ и т.д.).")
        return
    await state.update_data(country_code=code)
    await state.set_state(AdminStates.adding_country_currency)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="adm_countries")
    await message.answer(
        "➕ <b>ДОБАВИТЬ СТРАНУ</b>\n\n"
        "Шаг 3/4: Введите валюту (3 буквы, например: RUB, PLN, KZT):",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )


@dp.message(AdminStates.adding_country_currency)
async def adm_add_country_currency(message: types.Message, state: FSMContext):
    currency = (message.text or "").strip().upper()
    if len(currency) != 3:
        await message.answer("⚠️ Валюта — 3 буквы (RUB, PLN, KZT и т.д.).")
        return
    await state.update_data(currency=currency)
    await state.set_state(AdminStates.adding_country_exchange_rate)
    builder = InlineKeyboardBuilder()
    builder.button(text="Отмена", callback_data="adm_countries")
    await message.answer(
        "➕ <b>ДОБАВИТЬ СТРАНУ</b>\n\n"
        "Шаг 4/4: Введите курс (1 USD = X единиц валюты). Например:\n"
        "• Россия: 100\n• Польша: 4\n• Казахстан: 500",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )


@dp.message(AdminStates.adding_country_exchange_rate)
async def adm_add_country_exchange_rate(message: types.Message, state: FSMContext):
    try:
        rate = float((message.text or "").replace(",", ".").strip())
        if rate <= 0 or rate > 100000:
            await message.answer("⚠️ Курс должен быть положительным числом.")
            return
    except ValueError:
        await message.answer("⚠️ Введите число (например: 100 или 4.5).")
        return
    data = await state.get_data()
    country_name = data.get("country_name", "")
    country_code = data.get("country_code", "XX")
    currency = data.get("currency", "XXX")
    await state.clear()
    ok = db_add_country(country_name, country_code, currency, rate)
    if ok:
        await message.answer(
            f"✅ <b>Страна добавлена</b>\n\n"
            f"<blockquote>{country_name} ({country_code}) — {currency}, курс {rate}</blockquote>",
            parse_mode="HTML",
            reply_markup=kb_countries()
        )
    else:
        await message.answer(
            "⚠️ <b>Ошибка добавления</b>\n\n"
            "Проверьте логи. Возможно, страна с таким названием уже есть.",
            parse_mode="HTML",
            reply_markup=kb_countries()
        )


@dp.callback_query(F.data == "back_admin")
async def back_admin(call: types.CallbackQuery, state: FSMContext):
    """Возврат в админ панель"""
    await state.clear()
    settings = db_get_settings()
    countries = db_get_country_bank_details()
    
    text = get_admin_panel_text(settings, len(countries))
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_admin())

# ==========================================
# НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ
# ==========================================
def get_settings_text(user, locale="ru"):
    notifications = user.get('notifications_enabled', True)
    notif_status = "Включены" if notifications else "Выключены"
    return (
        f"<b>{t(locale, 'btn_settings').upper()}</b>\n"
        f"<blockquote>Язык: <b>{locale.upper()}</b>\n"
        f"Валюта: <b>₽ RUB</b>\n"
        f"Уведомления: <b>{notif_status}</b></blockquote>\n\n"
        "<i>Выберите параметр для изменения</i>"
    )


@dp.callback_query(F.data == "settings_menu")
async def settings_menu(call: types.CallbackQuery):
    """Меню настроек"""
    user_id = call.from_user.id
    user = db_get_user(user_id)
    if not user:
        await call.answer("Пользователь не найден", show_alert=True)
        return
    locale = db_get_user_locale(user_id)
    text = get_settings_text(user, locale)
    try:
        await call.message.edit_caption(caption=text, parse_mode="HTML", reply_markup=kb_settings(user, locale))
    except:
        try:
            await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_settings(user, locale))
        except:
            await call.message.answer(text, parse_mode="HTML", reply_markup=kb_settings(user, locale))


@dp.callback_query(F.data == "settings_change_lang")
async def settings_change_lang(call: types.CallbackQuery):
    """Выбор языка в настройках"""
    await call.answer()
    text = t(db_get_user_locale(call.from_user.id), "select_language")
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_settings_lang_select())


@dp.callback_query(F.data.in_(["settings_lang_en", "settings_lang_ru", "settings_lang_pl", "settings_lang_kk"]))
async def settings_lang_selected(call: types.CallbackQuery):
    """Сохранение выбранного языка в настройках"""
    user_id = call.from_user.id
    loc = call.data.replace("settings_lang_", "")
    if loc not in SUPPORTED_LOCALES:
        loc = "en"
    db_update_user_locale(user_id, loc)
    await call.answer(f"✅ Язык: {loc.upper()}")
    user = db_get_user(user_id)
    text = get_settings_text(user, loc)
    await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_settings(user, loc))

@dp.callback_query(F.data == "settings_notifications")
async def settings_notifications(call: types.CallbackQuery):
    """Переключение уведомлений"""
    user_id = call.from_user.id
    user = db_get_user(user_id)
    
    current_status = user.get('notifications_enabled', True) if user else True
    new_status = not current_status
    
    # Обновляем в БД
    db_update_field(user_id, "notifications_enabled", new_status)
    
    status_text = "включены" if new_status else "выключены"
    await call.answer(f"Уведомления {status_text}")
    user = db_get_user(user_id)
    locale = db_get_user_locale(user_id)
    text = get_settings_text(user, locale)
    try:
        await call.message.edit_caption(caption=text, parse_mode="HTML", reply_markup=kb_settings(user, locale))
    except:
        try:
            await call.message.edit_text(text, parse_mode="HTML", reply_markup=kb_settings(user, locale))
        except:
            pass

@dp.callback_query(F.data == "back_to_start")
async def back_to_start(call: types.CallbackQuery):
    """Возврат в главное меню"""
    user_id = call.from_user.id
    locale = db_get_user_locale(user_id)
    user = db_get_user(user_id)
    is_worker = bool(user and user.get("is_worker", False))
    settings = db_get_settings()
    welcome = get_welcome_text(locale)
    markup = kb_start(settings.get("support_username", "support"), user_id, is_worker, locale)
    try:
        await call.message.edit_caption(caption=welcome, parse_mode="HTML", reply_markup=markup)
    except Exception:
        await call.message.edit_text(welcome, parse_mode="HTML", reply_markup=markup)

@dp.callback_query(F.data == "back_to_start_from_file")
async def back_to_start_from_file(call: types.CallbackQuery):
    """Возврат в главное меню — отправляет новое сообщение"""
    user_id = call.from_user.id
    locale = db_get_user_locale(user_id)
    user = db_get_user(user_id)
    is_worker = bool(user and user.get("is_worker", False))
    settings = db_get_settings()
    welcome = get_welcome_text(locale)
    markup = kb_start(settings.get("support_username", "support"), user_id, is_worker, locale)
    try:
        await call.message.delete()
    except Exception:
        pass
    await call.message.answer(welcome, parse_mode="HTML", reply_markup=markup)

# ==========================================
# 🔧 УТИЛИТЫ И ОБРАБОТЧИКИ
# ==========================================
@dp.callback_query(F.data == "ignore")
async def ignore(call: types.CallbackQuery):
    """Игнорирование нажатия"""
    await call.answer()

@dp.callback_query(F.data == "cancel_action")
async def cancel_action(call: types.CallbackQuery, state: FSMContext):
    """Универсальная отмена действия"""
    await state.clear()
    await call.answer("❌ Действие отменено")
    try:
        await call.message.delete()
    except:
        pass

# ==========================================
# 🚀 ЗАПУСК БОТА
# ==========================================
def setup_http_app():
    app = web.Application()
    app.router.add_post("/api/deposit-notify", handle_deposit_notify)
    app.router.add_post("/api/deal-opened", handle_deal_opened)
    return app

async def main():
    await bot.delete_webhook(drop_pending_updates=True)
    app = setup_http_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", API_PORT)
    await site.start()
    logging.info(f"HTTP API listening on port {API_PORT} (POST /api/deposit-notify, /api/deal-opened)")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
