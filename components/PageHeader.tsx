import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Haptic } from '../utils/haptics';

export interface PageHeaderProps {
  /** Заголовок экрана (справа от кнопки «Назад») */
  title?: React.ReactNode;
  /** Обработчик возврата. Если передан — показывается кнопка «Назад» в шапке (единственная точка возврата на экране). */
  onBack?: () => void;
  /** Дополнительные элементы справа (опционально) */
  right?: React.ReactNode;
  className?: string;
}

const BACK_BUTTON_CLASS =
  'touch-target p-2 -ml-1 rounded-xl text-textMuted hover:text-textPrimary hover:bg-card active:scale-95 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30';

/**
 * Единая шапка вложенных экранов: одна кнопка «Назад» слева, заголовок по центру.
 * Использовать на всех экранах с возвратом — чтобы пользователь привык к одному месту навигации.
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, onBack, right, className = '' }) => {
  const handleBack = () => {
    if (onBack) {
      Haptic.tap();
      onBack();
    }
  };

  return (
    <header
      className={`flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0 sticky top-0 z-20 lg:px-6 lg:py-4 ${className}`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={handleBack}
          className={BACK_BUTTON_CLASS}
          aria-label="Назад"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
      ) : (
        <div className="w-10 h-10 shrink-0" aria-hidden />
      )}
      {title != null && (
        <div className="flex-1 min-w-0">
          {typeof title === 'string' ? (
            <span className="text-base font-semibold text-textPrimary truncate block lg:text-lg">
              {title}
            </span>
          ) : (
            title
          )}
        </div>
      )}
      {right != null && <div className="shrink-0">{right}</div>}
    </header>
  );
};

export default PageHeader;
