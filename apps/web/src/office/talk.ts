import type { AgentRole } from "@jarvisgram/shared";

/**
 * Bezak uchun suhbat iboralari (o'zbekcha). Holat va harakat haqiqiy ma'lumotdan,
 * bu iboralar faqat jonlilik uchun: dam olishda suhbat, majlisda javob, ishda o'z vazifasi haqida.
 * Haqiqiy hodisalar (Tayyor!, Men olaman!, log_add matni) MCP'dan keladi.
 */
export const TALK: Record<"chill" | "call" | "brief" | "walk" | "queued" | "jarvis", string[]> & Record<AgentRole, string[]> = {
  chill: [
    "Choy ichamizmi?",
    "Qahva zo'r ekan",
    "Bugun ish ko'pmi?",
    "Yangi trendni ko'rdingmi?",
    "Ha, ko'rdim",
    "Jarvis chaqirsa boramiz",
    "Kecha Reels zo'r chiqdi",
    "Bir oz dam olaylik",
    "Rostdanmi?",
    "Menga ham quyib yubor",
  ],
  call: ["Ketyapman!", "Majlisga!", "Hozir boraman", "Nima gap ekan?", "Yuringlar", "Bir daqiqa"],
  brief: ["Tushunarli", "Qachongacha?", "Bo'ldi, qilamiz", "Savol yo'q", "Yaxshi g'oya", "Men tayyorman"],
  walk: ["Boshladik", "Ishga!", "Tez tugataman"],
  queued: ["Navbatimni kutyapman", "Jarvis boshlashini kutyapman", "Materiallarni ko'rib chiqyapman"],
  jarvis: ["Rejani ko'ryapman", "Hisobotlar yaxshi", "Keyingi vazifa kimga?"],
  copywriter: ["Hook topdim!", "Caption deyarli tayyor", "Sarlavhani o'zgartiraman"],
  editor: ["Kadrni kesyapman", "Subtitr qo'yyapman", "Musiqa mos tushdi"],
  smm: ["19:00 ga qo'yaman", "Jadvalga kiritdim", "Stories ham kerak"],
  analyst: ["Raqamlarni yig'yapman", "Qamrov o'sibdi", "Jadval tayyor bo'lyapti"],
  commenter: ["Javob qoralayapman", "Savollar ko'p ekan", "Muloyim javob yozdim"],
  designer: ["Muqova rangini tanlayapman", "Shrift mos keldi", "Yana bir variant"],
  scriptwriter: ["Birinchi 3 soniya muhim", "Ssenariy tayyor bo'lyapti"],
  hashtagger: ["Xeshteglarni saralayapman", "Bu teg yaxshi ishlaydi"],
  trendHunter: ["Yangi trend chiqibdi", "Bu audio ommalashyapti"],
};

export const SHIRTS = [
  "#4d7cc9", "#5b8f6a", "#b5653f", "#8a6fb8", "#3f8f96", "#c2884a", "#6a7f99",
  "#a3566b", "#7a8c4a", "#5670b0", "#99703d", "#4f8d7c", "#8c5a8f",
];
export const HAIRS = ["#2a211c", "#4a3323", "#1b1b1d", "#6b4a2f", "#2f2a26"];
