import React, { createContext, useContext, useState, useEffect } from 'react';

interface KeyboardContextValue {
  /** True when an input/textarea/select is focused (keyboard likely open). */
  keyboardOpen: boolean;
}

const KeyboardContext = createContext<KeyboardContextValue>({ keyboardOpen: false });

function isInputElement(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isInputElement(e.target)) setKeyboardOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      // After focus leaves, check if new activeElement is still an input (e.g. tab between fields)
      const check = () => {
        if (!isInputElement(document.activeElement)) setKeyboardOpen(false);
      };
      setTimeout(check, 100);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <KeyboardContext.Provider value={{ keyboardOpen }}>
      {children}
    </KeyboardContext.Provider>
  );
}

export function useKeyboard() {
  return useContext(KeyboardContext);
}
