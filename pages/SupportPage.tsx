import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, HelpCircle, AlertCircle, MessageCircle, ChevronDown } from 'lucide-react';
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
}

const QUICK_HELP_BUTTONS = [
  { id: 'deposit', label: 'Проблема с депозитом', icon: '💰' },
  { id: 'withdraw', label: 'Проблема с выводом', icon: '💸' },
  { id: 'login', label: 'Не получается войти', icon: '🔐' },
  { id: 'kyc', label: 'Верификация KYC', icon: '📋' },
  { id: 'p2p', label: 'Вопрос по П2П', icon: '🔄' },
  { id: 'other', label: 'Другое', icon: '💬' },
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

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isGuest = !user;
  const isMiniApp = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp;

  const userDisplayName =
    user?.full_name || user?.username || user?.email || (tgid ? `TG ${tgid}` : guestName || 'Гость');

  useEffect(() => {
    const scrollToBottom = () => {
      const el = listRef.current;
      if (!el) return;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    };
    scrollToBottom();
  }, [messages.length]);

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
      const name = guestName.trim() || 'Гость';

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
        .select('id,thread_id,author,text,created_at')
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
  }, [user?.user_id, tgid, user?.email, guestEmail, guestName]);

  // Подстраховка: раз в 3 сек подтягиваем сообщения (ответы ТП из Telegram приходят в БД, но Realtime может не доставить)
  useEffect(() => {
    if (!threadId) return;
    const load = () => {
      supabase
        .from('support_messages')
        .select('id,thread_id,author,text,created_at')
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

  const sendToTelegram = async (text: string) => {
    if (!canNotifyWorker() || !threadId) return;
    await sendSupportMessageWithThread(
      {
        threadId,
        displayName: userDisplayName,
        email: (user?.email ?? guestEmail.trim()) || null,
        tgid: tgid ?? null,
        userId: user?.user_id ?? null,
        referrerId: user?.referrer_id ?? null,
      },
      text,
    ).catch(() => {});
    if (user?.referrer_id) {
      await sendSupportMessageToWorker(user.referrer_id, {
        name: userDisplayName,
        text,
        threadLabel: threadId ? threadId.slice(0, 8) : undefined,
      }).catch(() => {});
    }
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    if (user) {
      if (!threadId) return;
      await sendAsUser(content);
    } else {
      if (!guestEmail.trim() || !guestName.trim()) {
        toast.show('Введите email и имя для начала диалога', 'error');
        return;
      }
      if (!threadId) {
        toast.show('Подождите, создаётся чат…', 'error');
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
        .select('id,thread_id,author,text,created_at')
        .single();

      if (error || !data) {
        toast.show('Не удалось отправить. Попробуйте ещё раз.', 'error');
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
        .select('id,thread_id,author,text,created_at')
        .single();

      if (error || !data) {
        toast.show('Не удалось отправить. Попробуйте ещё раз.', 'error');
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

  const handleQuick = (preset: string) => {
    setInput(preset);
    setShowQuickHelp(false);
    inputRef.current?.focus();
    handleSend(preset);
  };

  const handleGuestStart = () => {
    const email = guestEmail.trim().toLowerCase();
    const name = guestName.trim();
    if (!email || !name) {
      toast.show('Введите email и имя', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.show('Некорректный email', 'error');
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
      <div className="flex flex-col h-full bg-background animate-fade-in max-w-2xl lg:max-w-4xl mx-auto">
        <PageHeader title="Чат поддержки" onBack={onBack} />
        <div className="flex-1 flex flex-col px-4 py-4">
          <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-neon/20 border border-neon/50 flex items-center justify-center">
                <MessageCircle size={24} className="text-neon" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-100">Напишите в поддержку</h3>
                <p className="text-xs text-neutral-500">
                  Войдите или укажите email для начала диалога
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neon/70"
              />
              <input
                type="text"
                placeholder="Ваше имя"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neon/70"
              />
              <button
                type="button"
                onClick={handleGuestStart}
                className="w-full py-3 rounded-xl bg-neon text-black font-semibold text-sm active:scale-[0.98] transition-transform"
              >
                Начать чат
              </button>
            </div>

            <p className="text-[11px] text-neutral-500 text-center">
              Откройте приложение из Telegram для быстрого доступа без ввода данных
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in max-w-2xl lg:max-w-4xl mx-auto">
        <PageHeader title="Чат поддержки" onBack={onBack} />

      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-3 pb-2 border-b border-border flex items-start gap-3 bg-gradient-to-r from-card/80 to-card/40">
          <div className="h-10 w-10 rounded-full bg-neon/20 border border-neon/50 flex items-center justify-center shrink-0">
            <HelpCircle size={20} className="text-neon" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-neutral-100 font-medium">
              Техподдержка Sellbit
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Ответим в течение 5–15 минут. Сообщения дублируются в Telegram.
            </p>
          </div>
        </div>

        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 py-3 space-y-4 bg-background"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {loading && (
            <div className="flex justify-center py-8 text-neutral-500 gap-2">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Подключаем чат…</span>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="h-14 w-14 rounded-full bg-surface/80 flex items-center justify-center mb-3">
                <MessageCircle size={28} className="text-neutral-500" />
              </div>
              <p className="text-sm text-neutral-400">Пока нет сообщений</p>
              <p className="text-xs text-neutral-600 mt-1">
                Опишите ситуацию или выберите тему ниже
              </p>
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.author === 'user';
            return (
              <div
                key={m.id}
                className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-neon text-black rounded-br-md'
                      : 'bg-card text-neutral-100 rounded-bl-md border border-border/60'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p
                    className={`mt-1.5 text-[10px] ${
                      isUser ? 'text-black/60' : 'text-neutral-500'
                    }`}
                  >
                    {new Date(m.created_at).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-3 pt-2 pb-3 border-t border-border bg-card/95 backdrop-blur-md space-y-2">
          {showQuickHelp && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-neutral-500">Быстрый выбор темы</span>
              <button
                type="button"
                onClick={() => setShowQuickHelp(false)}
                className="text-[10px] text-neutral-500 flex items-center gap-0.5"
              >
                Свернуть <ChevronDown size={12} className="rotate-180" />
              </button>
            </div>
          )}
          {showQuickHelp && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {QUICK_HELP_BUTTONS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleQuick(label)}
                  className="px-3 py-1.5 rounded-full bg-surface/90 text-[11px] text-neutral-200 border border-border hover:border-neon/40 hover:text-neon/90 transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  <span>{icon}</span>
                  <span className="truncate max-w-[160px]">{label}</span>
                </button>
              ))}
            </div>
          )}
          {!showQuickHelp && (
            <button
              type="button"
              onClick={() => setShowQuickHelp(true)}
              className="text-[11px] text-neutral-500 flex items-center gap-1"
            >
              <ChevronDown size={12} /> Показать быстрые темы
            </button>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="Напишите сообщение…"
              className="flex-1 resize-none bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neon/70 min-h-[44px] max-h-[120px]"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || sending || !threadId}
              className="h-11 w-11 rounded-xl bg-neon flex items-center justify-center text-black disabled:opacity-50 disabled:pointer-events-none active:scale-95 transition-transform shrink-0"
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
