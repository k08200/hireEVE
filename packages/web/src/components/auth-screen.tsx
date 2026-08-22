"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "../lib/i18n";

interface AuthScreenProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  asideTitle?: string;
  asideBody?: string;
  asideItems?: Array<{ label: string; value: string }>;
  footer?: ReactNode;
  navCtaHref?: string;
  navCtaLabel?: string;
}

/**
 * Entry stagger. Each shelf arrives one beat after the last so the eye is led
 * down the page instead of being handed everything at once. Kept under half a
 * second in total — this is a task surface, not a landing page, and a visitor
 * who came here to sign in must not wait on choreography.
 */
const STEP_MS = 70;
const rise = (step: number) => ({ animationDelay: `${step * STEP_MS}ms` });

export default function AuthScreen({
  eyebrow,
  title,
  description,
  children,
  asideTitle,
  asideBody,
  asideItems,
  footer,
  navCtaHref = "/early-access",
  navCtaLabel,
}: AuthScreenProps) {
  const { t } = useT();
  // Callers may override the marketing aside (e.g. early-access); otherwise
  // fall back to the translated defaults so the panel matches the app locale.
  const resolvedAsideTitle = asideTitle ?? t("auth.asideTitle");
  const resolvedAsideBody = asideBody ?? t("auth.asideBody");
  const resolvedAsideItems = asideItems ?? [
    { label: t("auth.stepSignal"), value: t("auth.stepSignalDesc") },
    { label: t("auth.stepContext"), value: t("auth.stepContextDesc") },
    { label: t("auth.stepApproval"), value: t("auth.stepApprovalDesc") },
  ];
  const resolvedNavCtaLabel = navCtaLabel ?? t("nav.earlyAccess");
  return (
    <main id="main" className="min-h-[100dvh] overflow-x-hidden sky-bg text-ink">
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <img src="/brand/mark.svg?v=matte2" alt="" className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-[0.14em] text-ink">Klorn</span>
        </Link>
        {/* Landing nav (Home / Early access) is noise on the app login —
            hide it on phones; the logo stays. */}
        <div className="hidden items-center gap-3 text-sm sm:flex">
          <Link
            className="inline-flex min-h-11 items-center whitespace-nowrap text-ink-mid transition duration-300 ease-fluid hover:text-ink"
            href="/"
          >
            {t("nav.home")}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-line px-3 py-2 text-ink-mid transition duration-300 ease-fluid hover:border-line-strong hover:bg-surface-hover hover:text-ink"
            href={navCtaHref}
          >
            {resolvedNavCtaLabel}
          </Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid min-h-[calc(100dvh-76px)] max-w-6xl items-start gap-8 px-5 pb-16 pt-6 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-14">
        <aside className="hidden lg:block">
          {/* No eyebrow here: the headline already names the surface, and a
              third wide-tracked all-caps label on one screen is a tic, not a
              hierarchy. */}
          <h2
            className="rise max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.03em] text-balance text-ink xl:text-6xl"
            style={rise(0)}
          >
            {resolvedAsideTitle}
          </h2>
          <p
            className="rise mt-6 max-w-[46ch] text-base leading-7 text-ink-mid text-pretty"
            style={rise(1)}
          >
            {resolvedAsideBody}
          </p>

          {/* Was a bordered card of three equal rows — the most generic shape
              in the deck. The numbers now hang in their own gutter as mono
              tabular figures and the rows are separated by hairlines alone, so
              the sequence reads as an editorial list rather than a widget. */}
          <ol className="rise mt-12 max-w-xl" style={rise(2)}>
            {resolvedAsideItems.map((item, index) => (
              <li
                key={item.label}
                className="grid grid-cols-[3rem_1fr] gap-6 border-t border-line py-5 last:border-b last:border-line"
              >
                <span className="font-mono text-sm tabular-nums leading-6 text-ink-dim">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[0.9375rem] font-medium leading-6 text-ink">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-mid text-pretty">{item.value}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <div className="mx-auto w-full max-w-md">
          <div className="rise mb-6" style={rise(1)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance text-ink">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink-mid text-pretty">{description}</p>
          </div>

          {/* Condensed reassurance for mobile + WebView users — the full <aside>
              is hidden below lg, so surface the same three signals compactly
              above the form so phone visitors still get context. */}
          <ol className="rise mb-5 lg:hidden" style={rise(2)}>
            <li className="border-t border-line pb-2 pt-3 text-sm font-medium text-ink">
              {resolvedAsideTitle}
            </li>
            {resolvedAsideItems.map((item) => (
              // Fixed label column: flex let each value start at a different
              // x depending on its label's width, so the three rows never
              // lined up. The desktop list has the same gutter.
              <li
                key={item.label}
                className="grid grid-cols-[4.5rem_1fr] gap-3 border-t border-line py-2.5"
              >
                <span className="text-xs font-medium text-ink">{item.label}</span>
                <span className="text-xs leading-5 text-ink-mid">{item.value}</span>
              </li>
            ))}
          </ol>

          {/* Double bezel: a tray holding a plate. The shell carries the
              hairline and the ambient shadow, the core carries the fill and
              its own lit top edge, and the radii are concentric (core = shell
              minus the 6px inset) so the curves stay parallel. */}
          <div
            className="rise rounded-[1.375rem] border border-line bg-surface-raised/70 p-1.5 shadow-[0_28px_64px_-32px_rgba(2,60,110,0.34)] backdrop-blur-[2px]"
            style={rise(3)}
          >
            <div className="edge-lit rounded-[1rem] bg-surface-panel p-4 sm:p-5">{children}</div>
          </div>

          {footer && (
            <div className="rise mt-5 text-center text-xs text-ink-muted" style={rise(4)}>
              {footer}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
