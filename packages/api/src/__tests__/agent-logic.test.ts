import { describe, expect, it } from "vitest";
import { getNotifKey, getToolRisk, TOOL_RISK_LEVELS } from "../agent-logic.js";

describe("getToolRisk", () => {
  it("returns LOW for safe, reversible tools", () => {
    expect(getToolRisk("create_reminder")).toBe("LOW");
    expect(getToolRisk("create_task")).toBe("LOW");
    expect(getToolRisk("update_task")).toBe("LOW");
    expect(getToolRisk("classify_emails")).toBe("LOW");
    expect(getToolRisk("mark_read")).toBe("LOW");
    expect(getToolRisk("execute_skill")).toBe("LOW");
  });

  it("returns MEDIUM for external-facing tools that need approval", () => {
    expect(getToolRisk("send_email")).toBe("MEDIUM");
    expect(getToolRisk("create_event")).toBe("MEDIUM");
    expect(getToolRisk("create_contact")).toBe("MEDIUM");
  });

  it("returns HIGH for destructive tools", () => {
    expect(getToolRisk("delete_task")).toBe("HIGH");
    expect(getToolRisk("delete_reminder")).toBe("HIGH");
    expect(getToolRisk("delete_event")).toBe("HIGH");
    expect(getToolRisk("delete_email")).toBe("HIGH");
    expect(getToolRisk("archive_email")).toBe("HIGH");
  });

  it("returns undefined for unknown tools (read-only or unclassified)", () => {
    expect(getToolRisk("list_tasks")).toBeUndefined();
    expect(getToolRisk("web_search")).toBeUndefined();
    expect(getToolRisk("nonexistent_tool")).toBeUndefined();
  });

  it("every classified delete-style tool is HIGH — guard against accidental downgrades", () => {
    // Any tool whose name starts with "delete_" must be HIGH or unclassified.
    // A LOW/MEDIUM delete_* would let the agent wipe user data without confirmation.
    for (const [name, risk] of TOOL_RISK_LEVELS) {
      if (name.startsWith("delete_")) {
        expect(risk, `${name} must be HIGH`).toBe("HIGH");
      }
    }
  });

  it("send_email and external tools are not downgraded to LOW", () => {
    expect(getToolRisk("send_email")).not.toBe("LOW");
  });
});

describe("getNotifKey", () => {
  it("lowercases input", () => {
    expect(getNotifKey("Meeting Alert")).toBe("meetingalert");
  });

  it("strips whitespace", () => {
    expect(getNotifKey("a b  c\td\ne")).toBe("abcde");
  });

  it("strips common punctuation", () => {
    expect(getNotifKey("!alert, please.")).toBe("alertplease");
    expect(getNotifKey("(group) - [note] 'x'\"y\"")).toBe("groupnotexy");
    expect(getNotifKey("·dot·middot")).toBe("dotmiddot");
  });

  it("truncates to 30 characters after stripping", () => {
    const long = "a".repeat(50);
    const key = getNotifKey(long);
    expect(key).toHaveLength(30);
    expect(key).toBe("a".repeat(30));
  });

  it("collapses two near-duplicate notification titles to the same key", () => {
    // The motivating case documented in the source comment.
    const a = getNotifKey("스크럼 장소 확인");
    const b = getNotifKey("스크럼 장소, 확인");
    expect(a).toBe(b);
  });

  it("does not collapse genuinely different titles", () => {
    expect(getNotifKey("Call John")).not.toBe(getNotifKey("Email John"));
  });

  it("returns empty string for input that is entirely stripped", () => {
    expect(getNotifKey("")).toBe("");
    expect(getNotifKey("   ")).toBe("");
    expect(getNotifKey("!!!...")).toBe("");
  });
});
