import { describe, expect, it } from "vitest";
import { safeNext } from "../src/lib/url";
import { actorLabel, fmtTime } from "../src/lib/i18n";

describe("safeNext", () => {
  it("faqat ichki yo'llarni qabul qiladi", () => {
    expect(safeNext("/oauth/consent?req=abc")).toBe("/oauth/consent?req=abc");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext(undefined, "/connect")).toBe("/connect");
  });
});

describe("i18n", () => {
  it("rol kalitlari o'zbekcha nomga aylanadi", () => {
    expect(actorLabel("copywriter")).toBe("Kopirayter");
    expect(actorLabel("jarvis")).toBe("Jarvis");
    expect(actorLabel("noma'lum")).toBe("noma'lum");
  });
  it("vaqt Toshkent mintaqasida", () => {
    expect(fmtTime("2026-11-18T06:00:00Z")).toBe("11:00");
  });
});

describe("formatlar ICU'ga bog'liq emas", () => {
  it("raqam va sana", async () => {
    const { fmtNum, fmtDate, fmtDateTime } = await import("../src/lib/i18n");
    expect(fmtNum(1302)).toBe("1 302");
    expect(fmtNum(1234567.25, 2)).toBe("1 234 567,25");
    expect(fmtNum(3.1)).toBe("3,1");
    expect(fmtNum(-12)).toBe("−12");
    expect(fmtDate("2026-11-18T20:00:00Z")).toBe("19.11");
    expect(fmtDateTime("2026-11-18T06:05:00Z")).toBe("18.11.2026, 11:05");
  });
});
