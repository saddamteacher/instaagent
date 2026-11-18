import { describe, expect, it } from "vitest";
import { AGENT_ROLES, AGENT_ROSTER, APPROVAL_REQUIRED_KINDS, ROLE_GUIDES, TASK_KINDS, TOTAL_DESKS } from "../src";

describe("agent rollari", () => {
  it("13 agent: Kopirayter×2, Montajer×2, SMM×2, Kommentator×2, qolganlari×1", () => {
    expect(AGENT_ROSTER).toHaveLength(13);
    const count = (r: string) => AGENT_ROSTER.filter((a) => a.role === r).length;
    expect([count("copywriter"), count("editor"), count("smm"), count("commenter")]).toEqual([2, 2, 2, 2]);
    for (const r of ["analyst", "designer", "scriptwriter", "hashtagger", "trendHunter"]) expect(count(r)).toBe(1);
    expect(new Set(AGENT_ROSTER.map((a) => a.deskNo)).size).toBe(13);
    expect(Math.max(...AGENT_ROSTER.map((a) => a.deskNo))).toBeLessThanOrEqual(TOTAL_DESKS);
  });

  it("har rolda maqsad, kirish, chiqish formati va sifat mezonlari bor", () => {
    for (const r of AGENT_ROLES) {
      const g = ROLE_GUIDES[r];
      expect(g.goal.length).toBeGreaterThan(10);
      expect(g.inputs.length).toBeGreaterThan(0);
      expect(g.outputFormat).toContain("JSON");
      expect(g.qualityCriteria.length).toBeGreaterThan(1);
      expect(g.names).toHaveLength(g.count);
      for (const k of g.allowedKinds) expect(TASK_KINDS).toContain(k);
    }
  });

  it("tashqi harakatlar faqat tasdiqli rollarda; layk/follow turi yo'q", () => {
    expect(ROLE_GUIDES.commenter.allowedKinds).toEqual(["comment_reply", "dm"]);
    expect(TASK_KINDS as readonly string[]).not.toContain("like");
    expect(TASK_KINDS as readonly string[]).not.toContain("follow");
    for (const r of AGENT_ROLES)
      if (r !== "smm" && r !== "commenter")
        expect(ROLE_GUIDES[r].allowedKinds.some((k) => APPROVAL_REQUIRED_KINDS.includes(k))).toBe(false);
  });
});
