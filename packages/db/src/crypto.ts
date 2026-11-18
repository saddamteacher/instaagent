import { createHash, randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const randomToken = (prefix = "", bytes = 32) => prefix + randomBytes(bytes).toString("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return ["scrypt", salt.toString("base64url"), key.toString("base64url")].join(".");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split(".");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length);
  return timingSafeEqual(key, expected);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Tasdiqlash kodi: 6 belgi, chalkash belgilarsiz (0/O, 1/I). */
export const approvalCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
