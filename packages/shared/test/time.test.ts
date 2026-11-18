import { describe, expect, it } from "vitest";
import { nextOccurrence, parseLocalDateTime, toLocalInput, zonedParts, zonedToUtc } from "../src";

describe("vaqt mintaqasi", () => {
  it("Toshkent (UTC+5) mahalliy vaqt ↔ UTC", () => {
    expect(zonedToUtc(2026, 11, 20, 9, 0, "Asia/Tashkent").toISOString()).toBe("2026-11-20T04:00:00.000Z");
    expect(parseLocalDateTime("2026-11-20T00:30")!.toISOString()).toBe("2026-11-19T19:30:00.000Z");
    expect(toLocalInput(new Date("2026-11-19T19:30:00Z"))).toBe("2026-11-20T00:30");
    expect(zonedParts(new Date("2026-11-23T04:00:00Z")).weekday).toBe(1); // dushanba
  });

  it("yozgi vaqt o'tishida ham to'g'ri (Europe/Berlin)", () => {
    expect(zonedToUtc(2026, 3, 29, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-03-29T07:00:00.000Z"); // CEST
    expect(zonedToUtc(2026, 3, 28, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-03-28T08:00:00.000Z"); // CET
  });

  it("haftalik jadvalning keyingi payti", () => {
    // 2026-11-18 chorshanba 12:00 Toshkent
    const now = new Date("2026-11-18T07:00:00Z");
    expect(nextOccurrence([1], "09:00", "Asia/Tashkent", now).toISOString()).toBe("2026-11-23T04:00:00.000Z");
    expect(nextOccurrence([], "19:00", "Asia/Tashkent", now).toISOString()).toBe("2026-11-18T14:00:00.000Z");
    expect(nextOccurrence([], "11:00", "Asia/Tashkent", now).toISOString()).toBe("2026-11-19T06:00:00.000Z");
    expect(nextOccurrence([3], "12:00", "Asia/Tashkent", now).toISOString()).toBe("2026-11-25T07:00:00.000Z"); // aynan hozir — keyingi hafta
    expect(() => nextOccurrence([1], "25:00", "Asia/Tashkent", now)).toThrow();
  });
});
