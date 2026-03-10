import React from 'react';
import { X } from 'lucide-react';
import { Z_INDEX } from '../constants/zIndex';
import { Haptic } from '../utils/haptics';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Закрывать по клику на затемнённый фон. По умолчанию true — удобно для подтверждений и форм. */
  closeOnBackdrop?: boolean;
  /** Дополнительный класс для панели контента */
  contentClassName?: string;
}

/**
 * Единый fullscreen bottom sheet: поверх страницы и навбара (z-index 60).
 * Красивое открытие (backdrop + slide-up 300ms), закрытие по клику на пустую область.
 */
const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  children,
  closeOnBackdrop = true,
  contentClassName = '',
}) => {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (closeOnBackdrop) {
      Haptic.light();
      onClose();
    }
  };

  const handleClose = () => {
    Haptic.tap();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in transition-opacity duration-300"
      style={{
        zIndex: Z_INDEX.modal,
        paddingBottom: 0,
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      <div
        className={`w-full max-w-md bg-card border-t border-border rounded-t-2xl shadow-2xl animate-sheet-up pb-safe overflow-hidden ${contentClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-4 pt-4 pb-3 border-b border-border/80 bg-surface/50">
          <h3 id="bottom-sheet-title" className="text-lg font-bold text-textPrimary">
            {title}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="touch-target p-2 -mr-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-card active:scale-95 transition-all flex items-center justify-center"
            aria-label="Закрыть"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[80dvh] scroll-app">
          {children}
        </div>
      </div>
    </div>
  );
};

export default BottomSheet;
