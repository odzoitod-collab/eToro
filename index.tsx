import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UserProvider } from './context/UserContext';
import { WebAuthProvider, useWebAuth } from './context/WebAuthContext';
import { ToastProvider } from './context/ToastContext';
import { KeyboardProvider } from './context/KeyboardContext';
import { PinProvider } from './context/PinContext';
import { LanguageProvider } from './context/LanguageContext';

function AppWithUser() {
  const { webUserId } = useWebAuth();
  return (
    <UserProvider webUserId={webUserId}>
      <ToastProvider>
          <PinProvider>
            <KeyboardProvider>
              <App />
            </KeyboardProvider>
          </PinProvider>
        </ToastProvider>
    </UserProvider>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const tg = (typeof window !== 'undefined' && (window as any).Telegram?.WebApp);
const TG_APP_BG = '#131722';

if (tg) {
  tg.ready();
  tg.expand();
  try {
    if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor(TG_APP_BG);
    if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor(TG_APP_BG);
    if (typeof tg.setBottomBarColor === 'function') tg.setBottomBarColor(TG_APP_BG);
  } catch (_) {}
  const ver = tg.version;
  const tgVersion = parseFloat(typeof ver === 'string' ? ver : '0');
  if (tgVersion > 6.0) {
    window.Telegram?.WebApp?.enableClosingConfirmation?.();
    window.Telegram?.WebApp?.disableVerticalSwipes?.();
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <WebAuthProvider>
        <AppWithUser />
      </WebAuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);