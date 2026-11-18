/**
 * Tariflar. NARXLAR VAQTINCHA — mahsulot egasi tasdiqlashi kerak (README → Tariflar).
 * Summalar so'mda; to'lov tizimlariga tiyinda (×100) yuboriladi.
 */
export const PLAN_IDS = ["free", "pro", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  title: string;
  /** Oylik narx, so'm */
  priceUzs: number;
  limits: {
    accounts: number;
    schedules: number;
    /** Rasmiy Instagram Graph API ulash */
    graphApi: boolean;
    /** Veb-ofisdagi ElevenLabs ovozli agent */
    voiceAgent: boolean;
  };
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    title: "Boshlang'ich",
    priceUzs: 0,
    limits: { accounts: 1, schedules: 2, graphApi: false, voiceAgent: false },
    features: ["1 ta Instagram akkaunt", "13 agentli virtual ofis", "Tasdiqlash navbati va kalendar", "2 ta takroriy vazifa"],
  },
  pro: {
    id: "pro",
    title: "Pro",
    priceUzs: 149_000,
    limits: { accounts: 3, schedules: 20, graphApi: true, voiceAgent: true },
    features: ["3 ta Instagram akkaunt", "Rasmiy Graph API orqali nashr", "Rejalashtirilgan avtomatik nashr (Graph)", "20 ta takroriy vazifa", "Ovozli buyruq (ElevenLabs)"],
  },
  agency: {
    id: "agency",
    title: "Agentlik",
    priceUzs: 449_000,
    limits: { accounts: 15, schedules: 100, graphApi: true, voiceAgent: true },
    features: ["15 ta Instagram akkaunt", "Pro'dagi hamma imkoniyatlar", "100 ta takroriy vazifa", "Ustuvor yordam"],
  },
};

export const PAID_PLANS: PlanId[] = ["pro", "agency"];
export const PERIOD_DAYS = 30;
