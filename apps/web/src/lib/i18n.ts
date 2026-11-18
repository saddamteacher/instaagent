import { ROLE_GUIDES, zonedParts } from "@jarvisgram/shared";

/**
 * Interfeys matnlari. Hozir o'zbekcha; keyin ru/en lug'atlari shu shaklda qo'shiladi.
 */
const uz = {
  brand: "Jarvisgram",
  nav: {
    dashboard: "Bosh sahifa",
    office: "Ofis",
    tasks: "Vazifalar",
    accounts: "Akkauntlar",
    connect: "Claude'ga ulash",
    calendar: "Kalendar",
    analytics: "Analitika",
    pricing: "Tariflar",
    soon: "tez orada",
    logout: "Chiqish",
  },
  auth: {
    loginTitle: "Jarvisgram'ga kirish",
    signupTitle: "Ro'yxatdan o'tish",
    email: "Email",
    password: "Parol",
    name: "Ismingiz",
    login: "Kirish",
    signup: "Hisob yaratish",
    noAccount: "Hisobingiz yo'qmi?",
    haveAccount: "Hisobingiz bormi?",
    invalid: "Email yoki parol noto'g'ri",
    passwordHint: "Kamida 8 belgi",
  },
  status: {
    queued: "Navbatda",
    in_progress: "Bajarilmoqda",
    awaiting_approval: "Tasdiq kutmoqda",
    approved: "Tasdiqlangan",
    rejected: "Rad etilgan",
    done: "Bajarildi",
  },
  agentState: { chill: "Dam olmoqda", meeting: "Majlisda", toDesk: "Stolga ketmoqda", working: "Ishlamoqda" },
  accountStatus: {
    pending: "Tekshirilmagan",
    connected: "Ulangan",
    needs_login: "Kirish kerak",
    limited: "Cheklangan",
    disconnected: "Uzilgan",
  },
  kind: {
    content: "Kontent",
    research: "Tadqiqot",
    analysis: "Tahlil",
    publish: "Nashr",
    comment_reply: "Izohga javob",
    dm: "DM javobi",
    other: "Boshqa",
  },
};

/** Interfeys vaqt mintaqasi (keyin foydalanuvchi sozlamasiga o'tadi). */
export const TZ = process.env.NEXT_PUBLIC_TZ ?? "Asia/Tashkent";

export type Dict = typeof uz;
export const t: Dict = uz;

const z2 = (n: number) => String(n).padStart(2, "0");

/** Sana-vaqt formatlari ICU'ga bog'liq emas (server va brauzerda bir xil — hydration xatosiz). */
export const fmtDateTime = (d: Date | string) => {
  const p = zonedParts(new Date(d), TZ);
  return `${z2(p.day)}.${z2(p.month)}.${p.year}, ${z2(p.hour)}:${z2(p.minute)}`;
};
export const fmtTime = (d: Date | string, seconds = false) => {
  const date = new Date(d);
  const p = zonedParts(date, TZ);
  return `${z2(p.hour)}:${z2(p.minute)}${seconds ? `:${z2(date.getUTCSeconds())}` : ""}`;
};

/** O'zbekcha raqam: minglik — bo'sh joy, kasr — vergul (1 302,5). */
export function fmtNum(v: number, maxFrac = 1) {
  const neg = v < 0;
  const r = Math.abs(v).toFixed(maxFrac).replace(/\.?0+$/, "");
  const [int, frac] = r.split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${neg ? "−" : ""}${grouped}${frac ? `,${frac}` : ""}`;
}

const ACTORS: Record<string, string> = { jarvis: "Jarvis", user: "Siz", system: "Tizim" };
/** Log muallifi: rol kaliti → o'zbekcha rol nomi. */
export const actorLabel = (actor: string) =>
  ACTORS[actor] ?? (ROLE_GUIDES as Record<string, { title: string } | undefined>)[actor]?.title ?? actor;

export const MONTHS_UZ = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
export const fmtDate = (d: Date | string) => {
  const p = zonedParts(new Date(d), TZ);
  return `${z2(p.day)}.${z2(p.month)}`;
};
export const contentTypeLabel: Record<string, string> = { post: "Post", reel: "Reels", carousel: "Karusel", story: "Stories" };
