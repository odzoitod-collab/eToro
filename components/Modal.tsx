import React from 'react';
import { Z_INDEX } from '../constants/zIndex';
import { Haptic } from '../utils/haptics';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Закрывать по клику на затемнённый фон. Для диалогов подтверждения обычно true. */
  closeOnBackdrop?: boolean;
}

/**
 * Центрированный модальный диалог (alert) для необратимых действий.
 * Использовать ТОЛЬКО для подтверждений (закрытие позиции, удаление и т.п.).
 */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  closeOnBackdrop = false,
}) => {
  const handleClose = () => {
    Haptic.tap();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      style={{ zIndex: Z_INDEX.modal }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-xs bg-card border border-border rounded-2xl shadow-2xl px-4 pt-4 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="modal-title"
          className="text-base font-semibold text-textPrimary mb-2 min-h-[24px]"
        >
          {title}
        </h2>
        <div className="text-sm text-textSecondary mb-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
