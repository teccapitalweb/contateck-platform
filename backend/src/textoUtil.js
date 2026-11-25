// Utilidad de texto compartida por el asistente (OT-0054/0056).
/** Minúsculas, sin acentos ni signos, con espacios simples y un espacio al inicio y al final (para buscar palabras completas). */
export function normalizar(texto) {
  return ' ' + String(texto == null ? '' : texto)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim() + ' ';
}
