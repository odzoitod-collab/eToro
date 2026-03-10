# Деплой на Render

## 1. Подключение репозитория

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Static Site**.
2. Подключите GitHub/GitLab и выберите репозиторий.
3. **Root Directory** (если монорепо): укажите `neonflow-crypto-exchange`.  
   Если репо — только фронт, оставьте пустым.
4. Render подхватит `render.yaml` из корня сервиса (из Root Directory, если задан).

### Ручная настройка (если не используете Blueprint)

- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`

## 2. Переменные окружения

В **Environment** добавьте (секреты не коммитить):

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `VITE_SUPABASE_URL` | Да | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | Да | Anon key из Supabase |
| `VITE_TELEGRAM_BOT_TOKEN` | Нет | Токен бота для уведомлений о заявках (виден в клиенте) |
| `VITE_DEPOSIT_CHANNEL_ID` | Нет | ID канала для заявок (например `-1003560670670`) |

После добавления переменных сделайте **Manual Deploy**, чтобы сборка прошла с новыми значениями.

## 3. SPA (если не используете render.yaml)

Если деплой без Blueprint: в настройках статического сайта добавьте **Redirects/Rewrites**:

- **Source:** `/*`
- **Destination:** `/index.html`
- **Action:** Rewrite (200)

## 4. Домен

Сайт будет доступен по `https://<имя-сервиса>.onrender.com`.  
Свой домен: **Settings** → **Custom Domains**.

## 5. Монорепо (корень репо — sellbit)

- В Render в **Root Directory** укажите `neonflow-crypto-exchange`.
- Либо положите `render.yaml` в корень репо и пропишите там:
  - `rootDir: neonflow-crypto-exchange`
  - `staticPublishPath: neonflow-crypto-exchange/dist`
