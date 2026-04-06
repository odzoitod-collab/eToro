import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Send,
  Loader2,
  Headphones,
  Inbox,
  ChevronDown,
  ImagePlus,
  X,
  Wallet,
  ArrowDownToLine,
  LogIn,
  ShieldCheck,
  RefreshCw,
  MoreHorizontal,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { Haptic } from '../utils/haptics';
import {
  canNotifyWorker,
  sendSupportMessageToWorker,
  sendSupportMessageWithThread,
  sendSupportPhotoWithThread,
} from '../lib/telegramNotify';

interface SupportPageProps {
  onBack: () => void;
}

interface SupportMessage {
  id: string;
  thread_id: string;
  author: 'user' | 'agent';
  text: string;
  created_at: string;
  image_url?: string | null;
}

const SUPPORT_ATTACHMENTS_BUCKET = 'support-attachments';
const MAX_SUPPORT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

function validateSupportImage(file: File): string | null {
  if (!file.type) return 'support_val_image_mime';
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return 'support_val_image_type';
  }
  if (file.size > MAX_SUPPORT_IMAGE_BYTES) return 'support_val_image_size';
  return null;
}

async function uploadSupportScreenshot(threadId: string, file: File): Promise<string | null> {
  const ext =
    file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg';
  const path = `${threadId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(SUPPORT_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) {
    console.warn('[Support] Storage upload failed:', error);
    return null;
  }
  const { data } = supabase.storage.from(SUPPORT_ATTACHMENTS_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

const QUICK_TOPICS: { id: string; labelKey: string; Icon: LucideIcon }[] = [
  { id: 'deposit', labelKey: 'support_topic_deposit', Icon: Wallet },
  { id: 'withdraw', labelKey: 'support_topic_withdraw', Icon: ArrowDownToLine },
  { id: 'login', labelKey: 'support_topic_login', Icon: LogIn },
  { id: 'kyc', labelKey: 'support_topic_kyc', Icon: ShieldCheck },
  { id: 'p2p', labelKey: 'support_topic_p2p', Icon: RefreshCw },
  { id: 'other', labelKey: 'support_topic_other', Icon: MoreHorizontal },
];

const SupportPage: React.FC<SupportPageProps> = ({ onBack }) => {
  const { user, tgid } = useUser();
  const { t } = useLanguage();
  const toast = useToast();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestStarted, setGuestStarted] = useState(false);
  const [showQuickHelp, setShowQuickHelp] = useState(true);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMiniApp = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp;

  const userDisplayName =
    user?.full_name || user?.username || user?.email || (tgid ? `TG ${tgid}` : guestName || t('guest'));

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length]);

  useEffect(() => {
    if (!pendingImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      setLoading(true);
      try {
        if (user) {
          await initLoggedInUser();
        } else if (guestEmail.trim() && guestName.trim()) {
          await initGuestThread();
        } else {
          setLoading(false);
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    const initLoggedInUser = async () => {
      if (!user) return;
      const { data: threads, error } = await supabase
        .from('support_threads')
        .select('id')
        .eq('user_id', user.user_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) return;

      let currentThreadId: string | null = threads?.[0]?.id ?? null;

      if (!currentThreadId) {
        const { data: inserted, error: insertErr } = await supabase
          .from('support_threads')
          .insert({
            user_id: user.user_id,
            tgid: tgid ?? null,
            email: user.email ?? null,
            display_name: userDisplayName,
            referrer_id: user.referrer_id ?? null,
            status: 'open',
            source: isMiniApp ? 'mini_app' : 'web',
            last_message_text: null,
          })
          .select('id')
          .single();

        if (insertErr || !inserted) return;
        currentThreadId = inserted.id as string;
      }

      setThreadId(currentThreadId);
      await loadMessages(currentThreadId);
      subscribeToMessages(currentThreadId);
    };

    const initGuestThread = async () => {
      const email = guestEmail.trim().toLowerCase();
      const name = guestName.trim() || t('guest');

      const { data: existing } = await supabase
        .from('support_threads')
        .select('id')
        .eq('email', email)
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(1);

      let currentThreadId: string | null = existing?.[0]?.id ?? null;

      if (!currentThreadId) {
        const { data: inserted, error: insertErr } = await supabase
          .from('support_threads')
          .insert({
            user_id: null,
            email,
            display_name: name,
            status: 'open',
            source: 'web',
            last_message_text: null,
          })
          .select('id')
          .single();

        if (insertErr || !inserted) return;
        currentThreadId = inserted.id as string;
      }

      setThreadId(currentThreadId);
      await loadMessages(currentThreadId);
      subscribeToMessages(currentThreadId);
    };

    const loadMessages = async (tid: string) => {
      const { data: msgs, error: msgsErr } = await supabase
        .from('support_messages')
        .select('id,thread_id,author,text,created_at,image_url')
        .eq('thread_id', tid)
        .order('created_at', { ascending: true });

      if (!msgsErr && msgs) {
        setMessages(msgs as SupportMessage[]);
      }
    };

    const subscribeToMessages = (tid: string) => {
      channel = supabase
        .channel(`support_thread:${tid}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'support_messages',
            filter: `thread_id=eq.${tid}`,
          },
          (payload) => {
            const row = payload.new as SupportMessage;
            setMessages((prev) => {
              if (prev.find((m) => m.id === row.id)) return prev;
              return [...prev, row].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              );
            });
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Support] Realtime subscription issue:', status);
          }
        });
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- инициализация треда только при смене идентификаторов
  }, [user?.user_id, tgid, user?.email, guestEmail, guestName]);

  useEffect(() => {
    if (!threadId) return;
    const load = () => {
      supabase
        .from('support_messages')
        .select('id,thread_id,author,text,created_at,image_url')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) setMessages(data as SupportMessage[]);
        });
    };
    const interval = setInterval(load, 3000);
    load();
    return () => clearInterval(interval);
  }, [threadId]);

  const supportThreadMeta = () => ({
    threadId: threadId!,
    displayName: userDisplayName,
    email: (user?.email ?? guestEmail.trim()) || null,
    tgid: tgid ?? null,
    userId: user?.user_id ?? null,
    referrerId: user?.referrer_id ?? null,
  });

  const sendToTelegram = async (
    text: string,
    opts?: { image?: File; imageUrl?: string | null }
  ) => {
    if (!canNotifyWorker() || !threadId) return;
    const meta = supportThreadMeta();
    if (opts?.image) {
      await sendSupportPhotoWithThread(meta, text, opts.image).catch(() => {});
    } else {
      await sendSupportMessageWithThread(meta, text).catch(() => {});
    }
    if (user?.referrer_id) {
      let workerText = text;
      if (opts?.imageUrl) workerText = `${text}\n${opts.imageUrl}`;
      else if (opts?.image) workerText = `${text}\n${t('support_worker_attachment_note')}`;
      await sendSupportMessageToWorker(user.referrer_id, {
        name: userDisplayName,
        text: workerText,
        threadLabel: threadId.slice(0, 8),
      }).catch(() => {});
    }
  };

  const handleSend = async (text?: string) => {
    if (sending || !threadId) return;

    if (pendingImage) {
      const caption = (text ?? input).trim() || t('support_chat_screenshot_default');
      if (user) await sendAsUserImage(pendingImage, caption);
      else await sendAsGuestImage(pendingImage, caption);
      return;
    }

    const content = (text ?? input).trim();
    if (!content) return;

    if (user) {
      await sendAsUser(content);
    } else {
      if (!guestEmail.trim() || !guestName.trim()) {
        toast.show(t('support_toast_guest_fields'), 'error');
        return;
      }
      if (!threadId) {
        toast.show(t('support_toast_wait_thread'), 'error');
        return;
      }
      await sendAsGuest(content);
    }
  };

  const sendAsUser = async (content: string) => {
    if (!threadId || !user) return;
    setSending(true);
    Haptic.tap();
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          thread_id: threadId,
          user_id: user.user_id,
          author: 'user',
          text: content,
          source: isMiniApp ? 'mini_app' : 'web',
        })
        .select('id,thread_id,author,text,created_at,image_url')
        .single();

      if (error || !data) {
        toast.show(t('support_toast_send_failed'), 'error');
        return;
      }

      setMessages((prev) => [...prev, data as SupportMessage]);
      setInput('');

      await supabase
        .from('support_threads')
        .update({
          last_message_text: content,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', threadId);

      await sendToTelegram(content);
    } finally {
      setSending(false);
    }
  };

  const sendAsUserImage = async (file: File, caption: string) => {
    if (!threadId || !user) return;
    setSending(true);
    Haptic.tap();
    try {
      const imageUrl = await uploadSupportScreenshot(threadId, file);
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          thread_id: threadId,
          user_id: user.user_id,
          author: 'user',
          text: caption,
          source: isMiniApp ? 'mini_app' : 'web',
          image_url: imageUrl,
        })
        .select('id,thread_id,author,text,created_at,image_url')
        .single();

      if (error || !data) {
        toast.show(
          imageUrl ? t('support_toast_save_failed') : t('support_toast_upload_failed'),
          'error',
        );
        return;
      }

      setMessages((prev) => [...prev, data as SupportMessage]);
      setInput('');
      setPendingImage(null);

      await supabase
        .from('support_threads')
        .update({
          last_message_text: caption,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', threadId);

      await sendToTelegram(caption, { image: file, imageUrl });
    } finally {
      setSending(false);
    }
  };

  const sendAsGuest = async (content: string) => {
    if (!threadId) return;
    setSending(true);
    Haptic.tap();
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          thread_id: threadId,
          author: 'user',
          text: content,
          source: 'web',
        })
        .select('id,thread_id,author,text,created_at,image_url')
        .single();

      if (error || !data) {
        toast.show(t('support_toast_send_failed'), 'error');
        return;
      }

      setMessages((prev) => [...prev, data as SupportMessage]);
      setInput('');

      await supabase
        .from('support_threads')
        .update({
          last_message_text: content,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', threadId);

      await sendToTelegram(content);
    } finally {
      setSending(false);
    }
  };

  const sendAsGuestImage = async (file: File, caption: string) => {
    if (!threadId) return;
    setSending(true);
    Haptic.tap();
    try {
      const imageUrl = await uploadSupportScreenshot(threadId, file);
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          thread_id: threadId,
          author: 'user',
          text: caption,
          source: 'web',
          image_url: imageUrl,
        })
        .select('id,thread_id,author,text,created_at,image_url')
        .single();

      if (error || !data) {
        toast.show(
          imageUrl ? t('support_toast_save_failed') : t('support_toast_upload_failed'),
          'error',
        );
        return;
      }

      setMessages((prev) => [...prev, data as SupportMessage]);
      setInput('');
      setPendingImage(null);

      await supabase
        .from('support_threads')
        .update({
          last_message_text: caption,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', threadId);

      await sendToTelegram(caption, { image: file, imageUrl });
    } finally {
      setSending(false);
    }
  };

  const handleQuick = (labelKey: string) => {
    const text = t(labelKey);
    setInput(text);
    setShowQuickHelp(false);
    inputRef.current?.focus();
    handleSend(text);
  };

  const handleGuestStart = () => {
    const email = guestEmail.trim().toLowerCase();
    const name = guestName.trim();
    if (!email || !name) {
      toast.show(t('support_toast_guest_required'), 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.show(t('support_toast_invalid_email'), 'error');
      return;
    }
    setGuestEmail(email);
    setGuestName(name);
    setGuestStarted(true);
    setThreadId(null);
    setMessages([]);
  };

  if (!user && !guestStarted) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-background animate-fade-in max-w-2xl lg:max-w-4xl mx-auto">
        <PageHeader title={t('support_chat_title')} onBack={onBack} />
        <div className="flex-1 flex flex-col px-4 py-6 overflow-y-auto">
          <div className="rounded-2xl bg-card overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.2)] ring-1 ring-inset ring-white/[0.06]">
            <div className="px-4 py-3 bg-surface/60 hairline-bottom">
              <p className="text-xs font-semibold text-textSecondary tracking-tight">
                {t('support_chat_guest_title')}
              </p>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center text-neon shrink-0">
                  <Headphones size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-textPrimary">{t('support_chat_guest_title')}</h3>
                  <p className="text-xs text-textMuted mt-0.5 leading-snug">{t('support_chat_guest_desc')}</p>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t('support_chat_email_ph')}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="w-full min-h-[52px] bg-card border border-border/80 rounded-2xl px-4 py-3.5 text-base text-textPrimary placeholder:text-textMuted outline-none focus-visible:ring-2 focus-visible:ring-neon/25 focus-visible:border-neon/40 transition-shadow"
                />
                <input
                  type="text"
                  autoComplete="name"
                  placeholder={t('support_chat_name_ph')}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full min-h-[52px] bg-card border border-border/80 rounded-2xl px-4 py-3.5 text-base text-textPrimary placeholder:text-textMuted outline-none focus-visible:ring-2 focus-visible:ring-neon/25 focus-visible:border-neon/40 transition-shadow"
                />
                <button
                  type="button"
                  onClick={handleGuestStart}
                  className="w-full touch-target min-h-[52px] py-3.5 rounded-2xl bg-neon text-black font-semibold text-base active:scale-[0.99] transition-transform hover:opacity-95"
                >
                  {t('support_chat_start')}
                </button>
              </div>

              <p className="text-xs text-textCaption text-center leading-relaxed hairline-top pt-4">
                {t('support_chat_tg_hint')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background animate-fade-in max-w-2xl lg:max-w-4xl mx-auto">
      <PageHeader title={t('support_chat_title')} onBack={onBack} />

      <div className="flex-1 flex flex-col min-h-0">
        <header className="shrink-0 px-4 py-2.5 hairline-bottom bg-background">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-surface flex items-center justify-center text-neon shrink-0">
              <Headphones size={16} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-semibold text-textPrimary tracking-tight leading-tight">
                {t('support_chat_team')}
              </h2>
              <p className="text-[11px] text-textMuted mt-0.5 leading-snug line-clamp-2">
                {t('support_chat_subtitle')}
              </p>
            </div>
          </div>
        </header>

        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 py-3 space-y-3 bg-background"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {loading && (
            <div className="flex justify-center items-center gap-2 py-10 text-textMuted">
              <Loader2 size={18} className="animate-spin shrink-0" />
              <span className="text-sm">{t('support_chat_connecting')}</span>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-2">
              <div className="h-14 w-14 rounded-xl bg-card border border-border flex items-center justify-center mb-3">
                <Inbox size={26} className="text-textMuted" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-medium text-textPrimary">{t('support_chat_empty')}</p>
              <p className="text-xs text-textMuted mt-1.5 max-w-xs leading-relaxed">{t('support_chat_empty_hint')}</p>
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.author === 'user';
            return (
              <div key={m.id} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-surface text-textPrimary border border-neon/35 shadow-sm'
                      : 'bg-card text-textPrimary border border-border shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.image_url && (
                    <a
                      href={m.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block rounded-lg overflow-hidden border border-border bg-black/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img
                        src={m.image_url}
                        alt=""
                        className="max-h-52 w-full object-contain"
                        loading="lazy"
                      />
                    </a>
                  )}
                  <p className="mt-2 text-[10px] font-mono tabular-nums text-textMuted">
                    {new Date(m.created_at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 px-4 pt-2 pb-2 pb-safe hairline-top bg-background space-y-2">
          {showQuickHelp && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-textSecondary tracking-tight">
                {t('support_chat_quick_topics')}
              </span>
              <button
                type="button"
                onClick={() => setShowQuickHelp(false)}
                className="text-[10px] text-textMuted hover:text-textSecondary flex items-center gap-0.5"
              >
                {t('support_chat_hide_topics')}
                <ChevronDown size={12} className="rotate-180" />
              </button>
            </div>
          )}
          {showQuickHelp && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1">
              {QUICK_TOPICS.map(({ id, labelKey, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleQuick(labelKey)}
                  className="touch-target flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-left hover:border-neon/35 active:scale-[0.99] transition-all flex-shrink-0 min-h-[44px]"
                >
                  <Icon size={16} className="text-neon shrink-0" strokeWidth={2} />
                  <span className="text-xs font-medium text-textSecondary whitespace-nowrap max-w-[200px] truncate">
                    {t(labelKey)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!showQuickHelp && (
            <button
              type="button"
              onClick={() => setShowQuickHelp(true)}
              className="text-[10px] text-textMuted hover:text-textSecondary flex items-center gap-1"
            >
              <ChevronDown size={12} />
              {t('support_chat_show_topics')}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const errKey = validateSupportImage(file);
              if (errKey) {
                toast.show(t(errKey), 'error');
                return;
              }
              Haptic.tap();
              setPendingImage(file);
            }}
          />

          {pendingImage && previewUrl && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
              <img
                src={previewUrl}
                alt=""
                className="h-12 w-12 rounded-lg object-cover shrink-0 border border-border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-textSecondary truncate font-mono">{pendingImage.name}</p>
                <p className="text-[10px] text-textMuted mt-0.5 leading-snug">{t('support_chat_preview_note')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  setPendingImage(null);
                }}
                className="touch-target p-2 rounded-lg border border-border text-textMuted hover:text-textPrimary shrink-0"
                aria-label={t('support_chat_remove_file')}
              >
                <X size={18} />
              </button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                fileInputRef.current?.click();
              }}
              disabled={!threadId || sending}
              className="touch-target h-10 w-10 rounded-xl border border-border/80 bg-card flex items-center justify-center text-textMuted hover:text-neon hover:border-neon/35 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-all shrink-0"
              title={t('support_chat_attach')}
              aria-label={t('support_chat_attach')}
            >
              <ImagePlus size={18} strokeWidth={2} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={t('support_chat_placeholder')}
              aria-label={t('support_chat_input_aria')}
              className="flex-1 resize-none bg-card border border-border/80 rounded-xl px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted outline-none focus-visible:ring-2 focus-visible:ring-neon/25 focus-visible:border-neon/40 min-h-[40px] max-h-[96px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] leading-snug"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sending || !threadId || (!input.trim() && !pendingImage)}
              className="touch-target h-10 w-10 rounded-xl bg-neon flex items-center justify-center text-black disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-transform shrink-0"
              title={t('support_chat_send')}
              aria-label={t('support_chat_send')}
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
