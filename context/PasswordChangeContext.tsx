import React, { createContext, useContext, useState } from 'react';

interface PasswordChangeContextValue {
  passwordChangeActive: boolean;
  setPasswordChangeActive: (active: boolean) => void;
}

const PasswordChangeContext = createContext<PasswordChangeContextValue | null>(null);

export function PasswordChangeProvider({ children }: { children: React.ReactNode }) {
  const [passwordChangeActive, setPasswordChangeActive] = useState(false);

  const value: PasswordChangeContextValue = { passwordChangeActive, setPasswordChangeActive };

  return (
    <PasswordChangeContext.Provider value={value}>
      {children}
    </PasswordChangeContext.Provider>
  );
}

export function usePasswordChange() {
  const ctx = useContext(PasswordChangeContext);
  if (!ctx) throw new Error('usePasswordChange must be used within PasswordChangeProvider');
  return ctx;
}
