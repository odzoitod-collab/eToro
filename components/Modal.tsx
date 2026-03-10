import React from 'react';
import { X } from 'lucide-react';
import { Z_INDEX } from '../constants/zIndex';
import { Haptic } from '../utils/haptics';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Закрывать по клику на затемнённый фон (для centered в будущем). */
  closeOnBackdrop?: boolean;
  /** fullscreen — на весь экран с шапкой. */
  variant?: 'fullscreen';
}

/**
 * Унифицированная модалка (полноэкранная с шапкой).
 * Анимация 300ms, консистентная шапка и кнопка закрытия. Z-index overlay.
 */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  closeOnBackdrop = false,
  variant = 'fullscreen',
}) => {
  const handleClose = () => {
    Haptic.tap();
    onClose();
  };

  if (!open) return null;

  if (variant === 'fullscreen') {
    return (
      <div
        className="fixed inset-0 flex flex-col bg-background animate-fade-in"
        style={{ zIndex: Z_INDEX.modal }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <h2 id="modal-title" className="text-base font-semibold text-textPrimary">
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="touch-target p-2 -mr-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-card active:scale-95 transition-all flex items-center justify-center border border-border"
            aria-label="Закрыть"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto scroll-app">{children}</div>
      </div>
    );
  }

  return null;
};

export default Modal;
