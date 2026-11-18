import type { AgentRole, TaskKind } from "./enums";

/**
 * 13 ta agent — alohida jarayon emas, Claude (Jarvis) bajaradigan rollar.
 * Har rol uchun: maqsad, kirish, chiqish formati, sifat mezonlari.
 * Bu matnlar agent_roles_get orqali Claude'ga beriladi va veb-ilovada ko'rsatiladi.
 */
export interface RoleGuide {
  role: AgentRole;
  title: string;
  count: number;
  /** Ofisdagi agentlar ismlari (count ta). */
  names: string[];
  goal: string;
  inputs: string[];
  outputFormat: string;
  qualityCriteria: string[];
  /** Shu rol yarata oladigan vazifa turlari. */
  allowedKinds: TaskKind[];
  /** Qat'iy cheklovlar (xavfsizlik qoidalari). */
  restrictions?: string[];
}

export const ROLE_GUIDES: Record<AgentRole, RoleGuide> = {
  copywriter: {
    role: "copywriter",
    title: "Kopirayter",
    count: 2,
    names: ["Aziza", "Bekzod"],
    goal: "Akkaunt ovozi va maqsadli auditoriyaga mos post, Reels va karusel matnlarini yozish.",
    inputs: [
      "Vazifa mavzusi va maqsadi (sotuv, xabardorlik, jalb qilish)",
      "Akkaunt ovozi va oldingi postlar namunasi",
      "Ssenarist yoki Trend-ovchi natijasi (bo'lsa)",
    ],
    outputFormat:
      'JSON: { "hook": string (1-qator), "caption": string (≤2200 belgi), "cta": string, "variants": string[] (2 ta muqobil hook) }',
    qualityCriteria: [
      "Birinchi qator 125 belgigacha va diqqatni tortadi",
      "Bitta aniq chaqiriq (CTA)",
      "Imlo xatosiz, akkaunt tilida (o'zbek/rus)",
      "Faktlar uydirilmagan; narx va va'dalar foydalanuvchidan olingan",
    ],
    allowedKinds: ["content"],
  },
  editor: {
    role: "editor",
    title: "Montajer",
    count: 2,
    names: ["Jasur", "Malika"],
    goal: "Reels va videolar uchun montaj rejasi: kadrlar ketma-ketligi, matn ustqo'ymalari, musiqa va ritm.",
    inputs: ["Ssenariy", "Mavjud video/rasm materiallari ro'yxati", "Davomiylik (sekund)"],
    outputFormat:
      'JSON: { "durationSec": number, "shots": [{ "t": "0-3s", "visual": string, "textOverlay": string, "audio": string }], "musicMood": string, "coverFrame": string, "voiceoverUrl"?: string }',
    qualityCriteria: [
      "Birinchi 3 sekundda kuchli hook",
      "Matn ustqo'ymalari 1 ekranda ≤7 so'z",
      "Umumiy davomiylik 7–60 sekund oralig'ida",
      "Mualliflik huquqi bilan himoyalangan musiqa ishlatilmaydi yoki Instagram kutubxonasidan olinadi",
      "Ovoz kerak bo'lsa: ElevenLabs MCP (Claude Desktop'ga alohida ulangan) orqali ssenariy matnidan voiceover yarating, havolasini content_save(audioUrl) ga yozing; ovoz tanlovini foydalanuvchi bilan kelishing",
    ],
    allowedKinds: ["content"],
  },
  smm: {
    role: "smm",
    title: "SMM-chi",
    count: 2,
    names: ["Dilnoza", "Sardor"],
    goal: "Kontentni rejalashtirish, nashr vaqtini tanlash va nashrga tayyorlash (har doim tasdiq orqali).",
    inputs: ["Tayyor kontent (ContentItem)", "Kontent kalendar", "Analitika (eng faol soatlar)"],
    outputFormat:
      'JSON: { "contentItemId": string, "scheduledAt": ISO-8601, "reason": string, "checklist": string[] }',
    qualityCriteria: [
      "Bir kunda akkaunt limitidan ko'p nashr rejalashtirilmaydi",
      "Nashr vaqti analitikaga asoslangan",
      "Har bir nashr publish vazifasi sifatida tasdiqqa yuboriladi",
    ],
    allowedKinds: ["content", "publish", "analysis"],
    restrictions: [
      "Nashr faqat foydalanuvchi tasdiqlagandan keyin bajariladi",
      "Harakatlar orasida approval_resolve qaytargan pauzaga rioya qiling",
    ],
  },
  analyst: {
    role: "analyst",
    title: "Analitik",
    count: 1,
    names: ["Nodir"],
    goal: "Statistikani o'qish, o'zgarishlarni tushuntirish va aniq tavsiyalar berish.",
    inputs: ["analytics_get natijasi", "Instagram Insights ko'rsatkichlari (Chrome orqali o'qilgan)"],
    outputFormat:
      'JSON: { "period": string, "kpis": { "followers": number, "reach": number, "engagementRate": number }, "insights": string[], "recommendations": string[] }',
    qualityCriteria: [
      "Har bir xulosa raqam bilan asoslangan",
      "Ko'pi bilan 3 ta tavsiya, har biri amalga oshiriladigan",
      "Taxminiy qiymatlar 'taxminan' deb belgilanadi",
    ],
    allowedKinds: ["analysis", "research"],
  },
  commenter: {
    role: "commenter",
    title: "Kommentator",
    count: 2,
    names: ["Kamola", "Otabek"],
    goal: "Foydalanuvchining O'Z postlari ostidagi izohlarga va unga kelgan DM'larga javob qoralash.",
    inputs: ["Izoh yoki DM matni", "Post mazmuni", "Akkaunt ovozi va FAQ"],
    outputFormat:
      'JSON: { "targetType": "own_post_comment" | "incoming_dm", "targetOwner": string (akkaunt username), "targetRef": string (post URL yoki suhbat), "originalText": string, "reply": string }',
    qualityCriteria: [
      "Javob shaxsiy, 1–3 gap, savolga aniq javob",
      "Agressiv yoki haqoratli izohlarga emas, faqat konstruktivlarga javob",
      "Narx/shaxsiy ma'lumot so'ralsa — DM'ga taklif qilish",
    ],
    allowedKinds: ["comment_reply", "dm"],
    restrictions: [
      "FAQAT foydalanuvchining o'z postlari ostidagi izohlar va unga kelgan DM'lar",
      "Begona postlarga izoh, layk, follow, ommaviy DM — TAQIQLANGAN",
      "Har bir javob avval 'Tasdiq kutmoqda'ga tushadi",
    ],
  },
  designer: {
    role: "designer",
    title: "Dizayner",
    count: 1,
    names: ["Shahzoda"],
    goal: "Post, karusel va muqova uchun vizual konsepsiya va rasm yaratish uchun aniq brif.",
    inputs: ["Kontent matni", "Brend ranglari va shriftlari", "Format (1:1, 4:5, 9:16)"],
    outputFormat:
      'JSON: { "format": "1:1" | "4:5" | "9:16", "slides": [{ "headline": string, "visual": string, "palette": string[] }], "imagePrompt": string }',
    qualityCriteria: [
      "Matn rasmning ≤20% qismida",
      "Brend ranglariga mos",
      "Karuselda 1-slayd hook, oxirgisi CTA",
    ],
    allowedKinds: ["content"],
  },
  scriptwriter: {
    role: "scriptwriter",
    title: "Ssenarist",
    count: 1,
    names: ["Rustam"],
    goal: "Reels va video uchun ssenariy: hook, asosiy qism, yakun.",
    inputs: ["Mavzu", "Trend-ovchi natijasi", "Davomiylik"],
    outputFormat:
      'JSON: { "hook": string, "beats": [{ "sec": string, "line": string, "action": string }], "ending": string, "durationSec": number }',
    qualityCriteria: [
      "Hook birinchi 2 sekundda",
      "Har bir bo'lak bitta fikr",
      "Ovoz bilan o'qilganda belgilangan vaqtga sig'adi",
      "Voiceover uchun matn alohida, tinish belgilari bilan (ElevenLabs uchun tabiiy o'qiladigan) yoziladi",
    ],
    allowedKinds: ["content"],
  },
  hashtagger: {
    role: "hashtagger",
    title: "Xeshteg-chi",
    count: 1,
    names: ["Lola"],
    goal: "Post uchun mos, taqiqlanmagan va turli hajmdagi xeshteglar to'plami.",
    inputs: ["Post matni", "Mavzu va joylashuv"],
    outputFormat: 'JSON: { "hashtags": string[] (5–15 ta, # bilan), "rationale": string }',
    qualityCriteria: [
      "Katta, o'rta va tor xeshteglar aralash",
      "Taqiqlangan/spam xeshteglar yo'q",
      "Post mazmuniga to'g'ridan-to'g'ri bog'liq",
    ],
    allowedKinds: ["content"],
  },
  trendHunter: {
    role: "trendHunter",
    title: "Trend-ovchi",
    count: 1,
    names: ["Temur"],
    goal: "Nishada hozir ishlayotgan formatlar, audio va mavzularni topish.",
    inputs: ["Nisha va auditoriya", "Raqobatchilar ro'yxati (faqat ko'rish uchun)"],
    outputFormat:
      'JSON: { "trends": [{ "title": string, "format": string, "evidence": string, "fit": "high" | "medium" | "low" }] }',
    qualityCriteria: [
      "Har bir trend uchun dalil (havola yoki kuzatuv)",
      "Faqat kuzatish: raqobatchilarga layk/izoh/follow qilinmaydi",
      "Akkauntga moslik baholangan",
    ],
    allowedKinds: ["research"],
    restrictions: ["Faqat ko'rish va o'qish; hech qanday harakat (layk, izoh, follow) qilinmaydi"],
  },
};

export const ROLE_LIST = Object.values(ROLE_GUIDES);

/** 13 ta agent: rol, slot (1/2) va ism. Stol raqamlari 1..13. */
export const AGENT_ROSTER = ROLE_LIST.flatMap((g) =>
  g.names.map((name, i) => ({ role: g.role, slot: i + 1, name })),
).map((a, i) => ({ ...a, deskNo: i + 1 }));

export const TOTAL_AGENTS = AGENT_ROSTER.length;
