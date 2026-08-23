import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * --color-accent (#0ea5e9) and --color-accent-light (#38bdf8) are surface and
 * tint values, not text backgrounds: white on them measures 2.77:1 and 2.14:1
 * in BOTH themes, because neither is theme-swapped. --accent-solid carries the
 * filled-control pair instead and does swap (white on sky-700 in light, ink on
 * sky-400 in dark).
 *
 * The first test is a source invariant — it catches the regression at the line
 * that introduces it, anywhere in the app, including screens behind auth that
 * a rendered check can never reach. The second proves the tokens actually
 * resolve to a passing pair on the surfaces we can load.
 */

// Playwright resolves testDir from the package root, so cwd is packages/web.
const SRC = join(process.cwd(), "src");
// A bare fill is either the flat token or a gradient STOP built from it — the
// first version of this guard only matched the flat form, so 37 gradient
// buttons and avatars carried white text at 2.14:1 straight through it
// (found 2026-08-23). from-/to-/via- are covered explicitly.
const BANNED = /\b(?:bg|from|via|to)-accent(-light)?\b(?!-)/;
const CLASS_STRING = /"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

test.describe("Accent contrast", () => {
  test("no source file paints white text on a bare accent fill", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      // Scan the whole file, not line by line: a className template literal
      // can span several lines, and the per-line version could never match
      // one — which is how the bottom-tabs account badge slipped through.
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(CLASS_STRING)) {
        const body = match[1] ?? match[2] ?? "";
        if (BANNED.test(body) && /\btext-white\b/.test(body)) {
          const line = text.slice(0, match.index).split("\n").length;
          offenders.push(`${file.slice(SRC.length + 1)}:${line}`);
        }
      }
    }
    expect(offenders, "use bg-accent-solid + text-accent-solid-ink instead").toEqual([]);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`filled accent controls clear AA in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await mockAuthProbes(page);
      await page.goto("/reset-password");
      // The CTA starts disabled, and a disabled control is exempt from 1.4.3 —
      // measuring it would test the disabled tokens, not the accent pair.
      await page.locator('input[type="email"]').fill("someone@example.com");
      const cta = page.getByRole("button", { name: /send reset link/i });
      await expect(cta).toBeEnabled();

      // The button carries a colour transition, so the frame right after the
      // disabled attribute drops still paints the disabled pair. Poll until
      // the transition settles rather than racing it.
      const measure = () =>
        cta.evaluate((el) => {
          const parse = (c: string) => {
            const ctx = document.createElement("canvas").getContext("2d")!;
            ctx.fillStyle = "#000";
            ctx.fillStyle = c;
            const h = ctx.fillStyle as string;
            if (h.startsWith("#")) return [1, 3, 5].map((i) => Number.parseInt(h.substr(i, 2), 16));
            return h
              .match(/[\d.]+/g)!
              .map(Number)
              .slice(0, 3);
          };
          const lum = (a: number[]) => {
            const f = (v: number) =>
              (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
          };
          const cs = getComputedStyle(el);
          const l1 = lum(parse(cs.color));
          const l2 = lum(parse(cs.backgroundColor));
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        });
      await expect.poll(measure).toBeGreaterThanOrEqual(4.5);
    });
  }
});

async function mockAuthProbes(page: Page) {
  await page.route("**/api/auth/signup-status", (r) => r.fulfill({ json: { open: true } }));
  await page.route("**/api/auth/providers", (r) =>
    r.fulfill({ json: { providers: [{ id: "google" }] } }),
  );
}
