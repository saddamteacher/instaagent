/** Ochiq yo'naltirishdan himoya: faqat shu saytning ichki yo'llari qabul qilinadi. */
export function safeNext(next: unknown, fallback = "/dashboard") {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
