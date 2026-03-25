/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TELEGRAM_BOT_TOKEN: string;
  readonly VITE_DEPOSIT_CHANNEL_ID: string;
  readonly VITE_BOT_API_URL?: string;
  readonly VITE_DEPOSIT_NOTIFY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
