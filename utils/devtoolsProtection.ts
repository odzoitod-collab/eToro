/**
 * Защита от входа в панель разработчика и просмотра консоли.
 * Блокирует: F12, Ctrl+Shift+I/J/C, Ctrl+U, правый клик.
 */

export function initDevtoolsProtection() {
  // 1. Блокировка горячих клавиш: F12, Ctrl+U, Ctrl+Shift+I/J/C
  document.addEventListener('keydown', (e) => {
    const k = e.key?.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (k === 'f12') {
      e.preventDefault();
      return false;
    }
    if (ctrl && k === 'u') {
      e.preventDefault();
      return false;
    }
    if (ctrl && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) {
      e.preventDefault();
      return false;
    }
  });

  // 2. Запрет правого клика (контекстное меню)
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  // 3. Стили: запрет выделения текста (НЕ в Mini App — может мешать тапам)
  const isTelegramWebApp = !!(window as any).Telegram?.WebApp;
  if (!isTelegramWebApp) {
    const style = document.createElement('style');
    style.id = 'devtools-protection-styles';
    style.textContent = `
      body { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
      input, textarea, [contenteditable="true"] { -webkit-user-select: text; user-select: text; }
    `;
    if (!document.getElementById('devtools-protection-styles')) {
      document.head.appendChild(style);
    }
  }

  // 4. Периодическая проверка DevTools — НЕ в Telegram Mini App (иначе лагает)
  if (!isTelegramWebApp) {
    const checkDevTools = () => {
      const threshold = 160;
      const w = window.outerWidth - window.innerWidth;
      const h = window.outerHeight - window.innerHeight;
      if (w > threshold || h > threshold) {
        // eslint-disable-next-line no-debugger
        debugger;
      }
    };
    setInterval(checkDevTools, 1000);
  }
}
