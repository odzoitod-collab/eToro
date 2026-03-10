import React, { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { Z_INDEX } from '../constants/zIndex';
import { Haptic } from '../utils/haptics';
import { hasStoredPin, checkPin as checkPinStorage } from '../utils/pinStorage';
import PinKeypad from '../components/PinKeypad';

interface PinContextValue {
  hasPin: (userId: string) => boolean;
  requirePin: (userId: string, title: string, onSuccess: () => void) => void;
}

const PinContext = createContext<PinContextValue | null>(null);

export function PinProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<{ title: string; onSuccess: () => void; userId: string } | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [error, setError] = useState(false);

  const hasPin = useCallback((userId: string) => hasStoredPin(userId), []);

  const requirePin = useCallback((userId: string, title: string, onSuccess: () => void) => {
    if (!hasStoredPin(userId)) {
      onSuccess();
      return;
    }
    setModal({ title, onSuccess, userId });
    setPinValue('');
    setError(false);
  }, []);

  const handleSubmit = useCallback(async (submittedValue?: string) => {
    const valueToCheck = submittedValue ?? pinValue;
    if (!modal || valueToCheck.length !== 4) return;
    const ok = await checkPinStorage(modal.userId, valueToCheck);
    if (ok) {
      Haptic.success();
      setModal(null);
      setPinValue('');
      setError(false);
      modal.onSuccess();
    } else {
      Haptic.error();
      setError(true);
      setPinValue('');
      setTimeout(() => setError(false), 600);
    }
  }, [modal, pinValue]);

  const handleClose = useCallback(() => {
    Haptic.light();
    setModal(null);
    setPinValue('');
    setError(false);
  }, []);

  const value: PinContextValue = { hasPin, requirePin };

  return (
    <PinContext.Provider value={value}>
      {children}
      {modal && (
        <div
          className="fixed inset-0 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
          style={{
            zIndex: Z_INDEX.modal,
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
            paddingTop: 'env(safe-area-inset-top)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              Haptic.light();
              handleClose();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-sheet-title"
        >
          <div
            className="w-full max-w-md bg-card border-t border-border rounded-t-2xl shadow-2xl animate-sheet-up pb-safe overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 pt-4 pb-3 border-b border-border/80 bg-surface/50">
              <h3 id="pin-sheet-title" className="text-lg font-bold text-textPrimary">
                {modal.title}
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
              <PinKeypad
                value={pinValue}
                onChange={setPinValue}
                onSubmit={(pin) => handleSubmit(pin)}
                error={error}
              />
              {error && (
                <p className="text-center text-red-400 text-sm mt-4 font-medium">Неверный пароль</p>
              )}
            </div>
          </div>
        </div>
      )}
    </PinContext.Provider>
  );
}

export function usePin() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePin must be used within PinProvider');
  return ctx;
}
