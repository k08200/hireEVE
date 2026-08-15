import { describe, expect, it } from "vitest";
import { extractContentId } from "../mail/gmail-fetch.js";

describe("extractContentId", () => {
  it("strips angle brackets and returns null when absent", () => {
    expect(extractContentId({ headers: [{ name: "Content-ID", value: "<logo@mail>" }] })).toBe(
      "logo@mail",
    );
    expect(extractContentId({ headers: [{ name: "content-id", value: "bare@id" }] })).toBe(
      "bare@id",
    );
    expect(extractContentId({ headers: [] })).toBeNull();
    expect(extractContentId({})).toBeNull();
    expect(extractContentId({ headers: [{ name: "Content-ID", value: "<>" }] })).toBeNull();
  });
});
