import React, { createContext, useContext, useState, useEffect } from 'react';

interface KeyboardContextValue {
  /** True when an input/textarea/select is focused (keyboard likely open). */
  keyboardOpen: boolean;
  /** Текущее смещение снизу (в px) под клавиатуру, чтобы CTA не перекрывался. */
  keyboardOffset: number;
}

const KeyboardContext = createContext<KeyboardContextValue>({ keyboardOpen: false });

function isInputElement(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

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

  // visualViewport — подстраиваем паддинг снизу под высоту клавиатуры
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handler = () => {
      const heightDiff = window.innerHeight - vv.height;
      // keyboard likely open when diff > 120px
      if (heightDiff > 120) {
        setKeyboardOffset(heightDiff);
        setKeyboardOpen(true);
      } else {
        setKeyboardOffset(0);
      }
    };
    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  return (
    <KeyboardContext.Provider value={{ keyboardOpen, keyboardOffset }}>
      {children}
    </KeyboardContext.Provider>
  );
}

export function useKeyboard() {
  return useContext(KeyboardContext);
}
