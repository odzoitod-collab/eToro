import type { CSSProperties } from 'react';

/**
 * Единая система верхних меню: сплошной фон страницы, без прозрачности и blur.
 * Специализация страницы — содержимое внутри APP_TOP_BAR_ROW.
 */
export const APP_TOP_BAR_CLASS =
  'sticky top-0 z-30 w-full shrink-0 bg-background hairline-bottom';

export const APP_TOP_BAR_STYLE: CSSProperties = {
  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
  minHeight: 52,
};

/** Базовая строка шапки (отступы согласованы с PageHeader) */
export const APP_TOP_BAR_ROW =
  'flex items-center gap-3 w-full min-h-[48px] px-4 pb-3 lg:px-6 lg:min-h-[52px] lg:pb-4';

/** Заголовок экрана в шапке */
export const APP_TOP_BAR_TITLE_CLASS =
  'text-lg font-semibold text-textPrimary tracking-tight';

/** Подзаголовок под заголовком (страницы с иконкой слева) */
export const APP_TOP_BAR_SUBTITLE_CLASS = 'text-xs text-textMuted mt-0.5 leading-snug';
