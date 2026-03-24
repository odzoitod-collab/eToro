import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import {
  APP_TOP_BAR_CLASS,
  APP_TOP_BAR_ROW,
  APP_TOP_BAR_STYLE,
  APP_TOP_BAR_TITLE_CLASS,
} from './appTopBar';

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
  'touch-target px-2 py-2 -ml-1 rounded-xl text-textMuted hover:text-textPrimary hover:bg-card active:scale-95 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30 min-h-[44px] min-w-[44px]';

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
    <header className={`${APP_TOP_BAR_CLASS} ${className}`} style={APP_TOP_BAR_STYLE}>
      <div className={APP_TOP_BAR_ROW}>
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
              <span className={`${APP_TOP_BAR_TITLE_CLASS} truncate block`}>{title}</span>
            ) : (
              title
            )}
          </div>
        )}
        {right != null && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
};

export default PageHeader;
