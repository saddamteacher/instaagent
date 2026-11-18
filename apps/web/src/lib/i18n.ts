import { ROLE_GUIDES } from "@jarvisgram/shared";

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

export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("uz-UZ", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
export const fmtTime = (d: Date | string, seconds = false) =>
  new Date(d).toLocaleTimeString("uz-UZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) });

const ACTORS: Record<string, string> = { jarvis: "Jarvis", user: "Siz", system: "Tizim" };
/** Log muallifi: rol kaliti → o'zbekcha rol nomi. */
export const actorLabel = (actor: string) =>
  ACTORS[actor] ?? (ROLE_GUIDES as Record<string, { title: string } | undefined>)[actor]?.title ?? actor;
