import { schedules, type Db } from "@jarvisgram/db";
import type { ToolDeps } from "./tools";

/**
 * Rejalashtiruvchi: har daqiqada (1) vaqti kelgan takroriy jadvallardan vazifa yaratadi,
 * (2) Graph API akkauntlarida foydalanuvchi tasdiqlagan rejalashtirilgan nashrlarni bajaradi.
 * Bir nechta nusxada ishlasa ham xavfsiz: har bir ish bazada "claim" qilinadi.
 */
export function startScheduler(db: Db, deps: ToolDeps, intervalMs = 60_000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await schedules.runDueSchedules(db);
      await schedules.runDuePublishes(db, deps.graph());
    } catch (e) {
      console.error("[scheduler]", e);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}
