import { describe, expect, it } from "vitest";
import { coercePlainBody, htmlToPlainText } from "../mail/email-text.js";

// HTML-only emails used to persist body=null and fall out of the summarizer
// forever ("Klorn has not analyzed this email yet"). htmlToPlainText is the
// rescue: a safe, sanitize-html-based text projection that keeps link hrefs
// (verification links live in href, not anchor text).

describe("htmlToPlainText", () => {
  it("strips tags to plain text", () => {
    expect(htmlToPlainText("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("keeps http(s) link targets so verification URLs survive", () => {
    const html =
      '<p>Confirm your email by <a href="https://huggingface.co/email_confirmation/abc">clicking here</a></p>';
    const text = htmlToPlainText(html);
    expect(text).toContain("https://huggingface.co/email_confirmation/abc");
  });

  it("drops javascript: and data: link targets", () => {
    const text = htmlToPlainText(
      '<a href="javascript:alert(1)">x</a><a href="data:text/html,hi">y</a>',
    );
    expect(text).not.toContain("javascript:");
    expect(text).not.toContain("data:");
  });

  it("preserves line structure for paragraphs and breaks", () => {
    const text = htmlToPlainText("<p>one</p><p>two</p>line<br>break");
    expect(text).toMatch(/one\s*\n+\s*two/);
    expect(text).toMatch(/line\s*\n\s*break/);
  });

  it("decodes common entities", () => {
    expect(htmlToPlainText("<p>a &amp; b &lt;c&gt;&nbsp;d</p>")).toBe("a & b <c> d");
  });

  it("never emits markup even from hostile input", () => {
    const text = htmlToPlainText("<img src=x onerror=alert(1)><script>alert(2)</script>ok");
    expect(text).not.toContain("<");
    expect(text).toContain("ok");
  });

  it("returns empty string for empty/blank html", () => {
    expect(htmlToPlainText("")).toBe("");
    expect(htmlToPlainText("   ")).toBe("");
  });
});

describe("coercePlainBody", () => {
  const PADDLE_LIKE_PLAIN = `<tr width="100%">
  <td width="100%" align="center" style="padding:0">
    <table style="max-width:600px;border-collapse:collapse" width="100%"><tbody>
      <tr><td style="padding:0">
        <h2 style="font-family:Graphik,Helvetica,sans-serif">Verify your identity</h2>
        <p style="font-size:16px">You&#39;re one step away from taking live payments.</p>
        <a href="https://in.sumsub.com/websdk/p/abc123" style="color:#fff">Verify my identity</a>
      </td></tr>
    </tbody></table>
  </td>
</tr>`;

  it("keeps genuine plain text untouched", () => {
    const body = "Hi,\n\nplease review the attached invoice.\n\nThanks";
    expect(coercePlainBody(body, "<p>Hi</p>")).toBe(body);
  });

  it("keeps prose that merely mentions a tag or two", () => {
    const body = "Use a <div> wrapper and close it with </div> when embedding.";
    expect(coercePlainBody(body, null)).toBe(body);
  });

  it("projects the html part when the plain part is raw html (Paddle 2026-08-13)", () => {
    const html = "<p>Hi yongrean,</p><p>You&#39;re one step away from taking live payments.</p>";
    const out = coercePlainBody(PADDLE_LIKE_PLAIN, html);
    expect(out).not.toContain("<td");
    expect(out).not.toContain("style=");
    expect(out).toContain("one step away from taking live payments");
  });

  it("strips the plain part itself when it is raw html and no html part exists", () => {
    const out = coercePlainBody(PADDLE_LIKE_PLAIN, null);
    expect(out).not.toContain("<td");
    expect(out).toContain("Verify your identity");
    // anchor href surfaced as text, like every other projection
    expect(out).toContain("https://in.sumsub.com/websdk/p/abc123");
  });

  it("passes null/empty through", () => {
    expect(coercePlainBody(null, "<p>x</p>")).toBeNull();
    expect(coercePlainBody("", "<p>x</p>")).toBe("");
  });
});
