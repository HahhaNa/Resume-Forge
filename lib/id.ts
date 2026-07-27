/** Ids and dates, kept out of the store so pure helpers can mint ids without importing it. */
export const uid = (p = "x") => `${p}${Math.random().toString(36).slice(2, 9)}`;
export const today = () => new Date().toISOString().slice(0, 10);
