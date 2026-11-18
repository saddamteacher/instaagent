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
