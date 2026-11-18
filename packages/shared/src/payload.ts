import type { ContentType, TaskKind } from "./enums";

/**
 * Tasdiqqa yuboriladigan va keyin AYNAN shu ko'rinishda bajariladigan harakat.
 * Foydalanuvchi veb-ilovada matnni tahrirlashi mumkin; Claude Chrome'da faqat shu payloadni yozadi.
 */
export interface PublishPayload {
  kind: "publish";
  type: ContentType;
  caption: string;
  hashtags: string[];
  /** Ommaviy https havolalar (Graph API uchun shart; Chrome'da foydalanuvchi faylni o'zi tanlashi mumkin). */
  mediaUrls: string[];
  /** Ovoz fayli (Reels uchun voiceover). Montajda videoga qo'shiladi; Instagram'ga alohida yuklanmaydi. */
  audioUrl?: string | null;
  scheduledAt: string | null;
  contentItemId: string | null;
}

export interface ReplyPayload {
  kind: "comment_reply" | "dm";
  targetType: "own_post_comment" | "incoming_dm";
  /** Akkauntning o'zi (o'z posti / o'ziga kelgan DM) */
  targetOwner: string;
  /** Post havolasi / izoh id (Graph) / DM suhbati */
  targetRef: string;
  /** Javob berilayotgan izoh yoki xabar matni */
  originalText: string;
  reply: string;
}

export type ActionPayload = PublishPayload | ReplyPayload;

export const isPublishPayload = (p: ActionPayload): p is PublishPayload => p.kind === "publish";

/** Instagram'ga yoziladigan to'liq matn (caption + xeshteglar yoki javob). */
export function payloadText(p: ActionPayload): string {
  if (p.kind === "publish") return [p.caption.trim(), p.hashtags.join(" ")].filter(Boolean).join("\n\n");
  return p.reply.trim();
}

export const ACTION_KINDS: readonly TaskKind[] = ["publish", "comment_reply", "dm"];
