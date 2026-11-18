import type { Db } from "./client";
import { signUp } from "./services/users";
import type { Ctx } from "./services/context";

/** Testlar uchun: barcha jadvallarni tozalash. Faqat test bazasida! */
export async function resetDb(db: Db) {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/.test(url)) throw new Error("resetDb faqat test bazasida ishlaydi (DATABASE_URL'da 'test' bo'lishi kerak)");
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length) await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
}

let n = 0;
/** Test foydalanuvchisi. Standart: "agency" tarifi (limitlar testlarga xalaqit bermasin); limit testlari uchun plan="free". */
export async function makeUser(db: Db, name = "Test", plan: "free" | "pro" | "agency" = "agency") {
  n++;
  const { user, workspace } = await signUp(db, { email: `u${Date.now()}_${n}@test.uz`, password: "parol12345", name });
  if (plan !== "free")
    await db.subscription.create({ data: { workspaceId: workspace.id, plan, currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) } });
  const ctx: Ctx = { db, workspaceId: workspace.id, actor: "jarvis" };
  return { user, workspace, ctx };
}
