/**
 * Шкала z-index для консистентных слоёв.
 * content 10, header 20, overlay 50, modal 60, picker 70, toast 100, fullscreen 200.
 */
export const Z_INDEX = {
  content: 10,
  header: 20,
  overlay: 50,
  modal: 60,
  picker: 70,
  toast: 100,
  fullscreen: 200,
} as const;
