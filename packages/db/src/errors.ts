export type DomainErrorCode =
  | "not_found"
  | "invalid_transition"
  | "approval_required"
  | "approval_code_invalid"
  | "limit_reached"
  | "forbidden"
  | "conflict"
  | "invalid_input"
  | "unauthorized";

/** Domen xatosi: message foydalanuvchiga/Claude'ga ko'rsatiladi (o'zbekcha). */
export class DomainError extends Error {
  constructor(
    public code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("not_found", `${what} topilmadi`);
