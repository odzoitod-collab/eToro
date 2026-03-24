import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Haptic } from '../utils/haptics';

export type LegalDocId = 'tos' | 'privacy' | 'aml' | 'cookies';

interface LegalDocModalProps {
  doc: LegalDocId | null;
  onClose: () => void;
}

const TITLES: Record<LegalDocId, string> = {
  tos: 'Terms of Service',
  privacy: 'Privacy Policy',
  aml: 'AML / KYC',
  cookies: 'Cookie Policy',
};

const LegalDocModal: React.FC<LegalDocModalProps> = ({ doc, onClose }) => {
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, onClose]);

  if (!doc) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-doc-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[min(88vh,720px)] bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl flex flex-col animate-sheet-up sm:animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 hairline-bottom shrink-0">
          <h2 id="legal-doc-title" className="text-lg font-semibold text-textPrimary tracking-tight">
            {TITLES[doc]}
          </h2>
          <button
            type="button"
            onClick={() => {
              Haptic.light();
              onClose();
            }}
            className="touch-target p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-surface"
            aria-label="Закрыть"
          >
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 text-sm text-textSecondary leading-relaxed space-y-3">
          <p>
            Настоящий документ — справочный шаблон для интерфейса. Юридически значимый текст должен быть утверждён
            вашим юристом и размещён по отдельной странице или PDF. Здесь описаны типовые разделы, ожидаемые
            регуляторами в ЕС и на криптобиржах.
          </p>
          {doc === 'tos' && (
            <>
              <p><strong className="text-textPrimary">1. Услуги.</strong> Платформа предоставляет доступ к торговым и информационным сервисам на условиях оферты.</p>
              <p><strong className="text-textPrimary">2. Риски.</strong> Операции с цифровыми активами связаны с высоким риском потери средств.</p>
              <p><strong className="text-textPrimary">3. Ограничения.</strong> Сервис может быть недоступен в отдельных юрисдикциях.</p>
            </>
          )}
          {doc === 'privacy' && (
            <>
              <p><strong className="text-textPrimary">Данные.</strong> Обрабатываются идентификаторы аккаунта, технические логи и данные, необходимые для KYC/AML.</p>
              <p><strong className="text-textPrimary">Цели.</strong> Исполнение договора, безопасность, соблюдение закона.</p>
              <p><strong className="text-textPrimary">Права.</strong> Доступ, исправление, ограничение обработки — в порядке, предусмотренном GDPR (применимо).</p>
            </>
          )}
          {doc === 'aml' && (
            <>
              <p><strong className="text-textPrimary">KYC.</strong> Идентификация клиента и проверка документов при необходимости.</p>
              <p><strong className="text-textPrimary">AML.</strong> Мониторинг подозрительной активности и отчётность по требованиям регуляторов.</p>
            </>
          )}
          {doc === 'cookies' && (
            <>
              <p>Используются необходимые cookie для входа, безопасности и аналитики. Вы можете управлять cookie в настройках браузера.</p>
            </>
          )}
        </div>
        <div className="shrink-0 px-5 py-4 hairline-top">
          <button
            type="button"
            onClick={() => {
              Haptic.light();
              onClose();
            }}
            className="w-full py-3.5 rounded-xl bg-neon text-black font-semibold text-sm active:scale-[0.99] transition-transform"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalDocModal;
