import React from 'react';
import { Loader2 } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';

export type BottomSheetFooterVariant = 'default' | 'destructive';

interface BottomSheetFooterProps {
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  variant?: BottomSheetFooterVariant;
}

/**
 * Унифицированный футер для BottomSheet:
 * Cancel слева (secondary), Confirm справа (primary/destructive),
 * единые отступы и учёт safe-area снизу.
 */
const BottomSheetFooter: React.FC<BottomSheetFooterProps> = ({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  confirmDisabled = false,
  confirmLoading = false,
  variant = 'default',
}) => {
  const { t } = useLanguage();
  const showCancel = !!onCancel;
  const showConfirm = !!onConfirm;

  const handleCancel = () => {
    Haptic.light();
    onCancel?.();
  };

  const handleConfirm = () => {
    if (!onConfirm || confirmDisabled || confirmLoading) return;
    Haptic.tap();
    onConfirm();
  };

  const confirmBaseClasses =
    'rounded-xl font-bold text-sm active:scale-95 transition-transform flex items-center justify-center min-h-[48px]';

  const confirmVariantClasses =
    variant === 'destructive'
      ? 'bg-red-500 text-white hover:opacity-90'
      : 'bg-neon text-black hover:opacity-90';

  const confirmDisabledClasses = confirmDisabled || confirmLoading ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <div className="flex gap-3 px-4 pb-safe mt-4">
      {showCancel && (
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 min-h-[48px] rounded-xl border border-neutral-700 text-neutral-400 text-sm font-medium active:scale-95 transition-transform"
        >
          {cancelLabel ?? t('cancel')}
        </button>
      )}
      {showConfirm && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirmDisabled || confirmLoading}
          className={`flex-1 ${confirmBaseClasses} ${confirmVariantClasses} ${confirmDisabledClasses}`}
        >
          {confirmLoading && (
            <Loader2 size={18} className="mr-2 animate-spin" />
          )}
          <span>{confirmLabel ?? t('confirm')}</span>
        </button>
      )}
    </div>
  );
};

export default BottomSheetFooter;

