/** Приятная короткая вибрация при нажатии (кнопки, табы, чипы). */
export const Haptic = {
  /** Мягкий отклик на тап — один короткий импульс. */
  tap: () => {
    if (navigator.vibrate) navigator.vibrate(8);
  },
  /** Лёгкое нажатие (выбор, шаг, копирование). */
  light: () => {
    if (navigator.vibrate) navigator.vibrate(12);
  },
  /** Среднее нажатие (важное действие). */
  medium: () => {
    if (navigator.vibrate) navigator.vibrate(35);
  },
  /** Успех (сделка, вывод одобрен). */
  success: () => {
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
  },
  /** Ошибка валидации или операции. */
  error: () => {
    if (navigator.vibrate) navigator.vibrate([40, 80, 40]);
  },
};