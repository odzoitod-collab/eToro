import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'info' | 'error' | 'success';

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>('info');

  const show = useCallback((msg: string, t: ToastType = 'info') => {
    setMessage(msg);
    setType(t);
    setTimeout(() => setMessage(null), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <div
          className={`fixed left-4 right-4 max-w-md lg:mx-auto lg:left-1/2 lg:right-auto lg:-translate-x-1/2 bottom-[5.5rem] lg:bottom-24 py-3 px-4 rounded-xl text-center text-sm font-medium z-[100] animate-slide-up shadow-lg ${
            type === 'error' ? 'bg-red-500/95 text-white' : type === 'success' ? 'bg-green-500/95 text-black' : 'bg-card text-white border border-border'
          }`}
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { show: () => {} };
  return ctx;
}
