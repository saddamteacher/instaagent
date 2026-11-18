export type DomainErrorCode =
  | "not_found"
  | "invalid_transition"
  | "approval_required"
  | "approval_code_invalid"
  | "limit_reached"
  | "forbidden"
  | "conflict"
  | "invalid_input"
  | "unauthorized"
  /** Pauza tugamagan — retryAfterSeconds dan keyin */
  | "too_soon"
  /** Rejalashtirilgan vaqt hali kelmagan */
  | "not_yet"
  | "unsupported"
  /** Tashqi xizmat (Graph API) xatosi */
  | "upstream"
  /** Tarif limiti — /pricing */
  | "plan_limit";

/** Domen xatosi: message foydalanuvchiga/Claude'ga ko'rsatiladi (o'zbekcha). */
export class DomainError extends Error {
  constructor(
    public code: DomainErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("not_found", `${what} topilmadi`);
