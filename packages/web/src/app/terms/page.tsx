import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - Klorn",
  description: "Klorn beta terms of service.",
};

const updatedAt = "May 4, 2026";

/** Stable, URL-safe anchor id so the TOC links line up with each section. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SECTIONS = [
  "Beta Product",
  "Your Responsibilities",
  "Approval and Automation",
  "Google Services",
  "Not Professional Advice",
  "Availability and Data Loss",
  "Billing, Cancellation, and Refunds",
  "Limitation of Liability",
  "Governing Law",
  "Account Deletion",
  "Changes",
  "Contact",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section id={slug(title)} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="space-y-3 text-base leading-7 text-ink-mid">{children}</div>
    </section>
  );
}

function TableOfContents({ sections }: { sections: string[] }) {
  return (
    <nav
      aria-label="On this page"
      className="mt-10 rounded-xl border border-line bg-surface-raised p-5"
    >
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-mid">On this page</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {sections.map((title) => (
          <li key={title}>
            <a
              href={`#${slug(title)}`}
              className="inline-flex min-h-11 items-center text-sm text-ink-mid transition hover:text-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-1 focus-visible:ring-offset-white rounded"
            >
              {title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function TermsPage() {
  return (
    <main id="main" className="min-h-screen sky-bg text-ink">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-[#f5f0e8]">
            <img src="/brand/mark.svg?v=matte2" alt="" className="h-9 w-9" />
          </div>
          <span className="text-lg font-bold tracking-tight">Klorn</span>
        </Link>
        <div className="flex items-center gap-5 text-sm text-ink-mid">
          <Link href="/privacy" className="transition hover:text-ink">
            Privacy
          </Link>
          <Link href="/login" className="transition hover:text-ink">
            Log in
          </Link>
        </div>
      </nav>

      <article className="mx-auto max-w-4xl px-6 py-14">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-deep">
          TERMS OF SERVICE
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          Klorn Beta Terms
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-ink-mid">
          Last updated: {updatedAt}. These terms apply to the Klorn beta. By using Klorn, you agree
          to these terms and the Privacy Policy.
        </p>

        <TableOfContents sections={SECTIONS} />

        <div className="mt-12 space-y-10">
          <Section title="Beta Product">
            <p>
              Klorn is currently a beta product. Features may change, fail temporarily, be rate
              limited, or be removed. Klorn can make mistakes in summaries, classification,
              reminders, meeting preparation, and proposed actions.
            </p>
          </Section>

          <Section title="Your Responsibilities">
            <ul className="list-disc space-y-2 pl-5">
              <li>You are responsible for the accounts and data you connect to Klorn.</li>
              <li>Use Klorn only with accounts you own or are authorized to connect.</li>
              <li>Review important outputs before using or relying on them.</li>
              <li>
                Do not use Klorn in ways that violate law, contracts, privacy rights, or platform
                rules.
              </li>
            </ul>
          </Section>

          <Section title="Approval and Automation">
            <p>
              Klorn may create reminders, briefings, classifications, notifications, and approval
              proposals. Sensitive actions, including sending email, require your review and
              approval before execution. You are responsible for actions you approve.
            </p>
          </Section>

          <Section title="Google Services">
            <p>
              When you connect Gmail or Google Calendar, you authorize Klorn to access Google data
              needed to provide Klorn features. You can revoke Klorn's Google access at any time
              from your Google account settings.
            </p>
          </Section>

          <Section title="Not Professional Advice">
            <p>
              Klorn can help organize work, draft language, and prioritize decisions. Klorn does not
              provide legal, financial, medical, employment, or other professional advice. Verify
              important information before acting on it.
            </p>
          </Section>

          <Section title="Availability and Data Loss">
            <p>
              We work to keep Klorn reliable, but the beta is provided without uptime guarantees. We
              are not responsible for missed notifications, sync delays, inaccurate results, or data
              loss caused by beta limitations, third-party outages, or user configuration.
            </p>
          </Section>

          <Section title="Billing, Cancellation, and Refunds">
            <p>
              Klorn Pro is a monthly subscription at $8.99/month, billed through Paddle. Paddle is
              the merchant of record for these purchases: Paddle handles the payment, issues the
              receipt, and appears on your card or bank statement.
            </p>
            <p>
              New subscriptions start with a 7-day free trial. You are not charged during the trial.
              Cancel before it ends and you are never billed.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Cancel anytime.</strong> Cancellation stops future renewals. Your Pro access
                continues until the end of the period you already paid for.
              </li>
              <li>
                <strong>14-day refund on a first paid month.</strong> If Klorn is not for you, email
                us within 14 days of your first charge and we will refund it in full — no
                explanation needed.
              </li>
              <li>
                <strong>After that window,</strong> paid periods are non-refundable by default,
                because access was available for the period. If something went wrong on our side —
                an outage, a failed sync, a charge you did not expect — write to us and we will make
                it right.
              </li>
              <li>
                <strong>Statutory rights are unaffected.</strong> Where local consumer law grants
                you a stronger right of withdrawal or refund, that law applies and overrides this
                section.
              </li>
            </ul>
            <p>
              To cancel or request a refund, email{" "}
              <a
                className="text-accent-deep hover:text-accent-deeper"
                href="mailto:k0820086@gmail.com"
              >
                k0820086@gmail.com
              </a>{" "}
              from the address on your Klorn account. Refunds are returned to the original payment
              method; the time it takes to appear depends on your bank.
            </p>
            <p>
              Klorn's free tier remains free, and the source is available under AGPL for
              self-hosting — self-hosted instances involve no billing relationship with us.
            </p>
          </Section>

          <Section title="Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Klorn and its operators are not liable for
              indirect, incidental, special, consequential, or punitive damages, or any loss of
              profits, revenue, data, or goodwill arising from your use of Klorn. The total
              aggregate liability for any claim relating to Klorn is limited to the amount you paid
              for Klorn in the twelve months preceding the claim, or fifty US dollars if you paid
              nothing.
            </p>
          </Section>

          <Section title="Governing Law">
            <p>
              These terms are governed by the laws of the Republic of Korea, without regard to its
              conflict of laws principles. Any dispute arising from or related to these terms will
              be resolved in the courts located in Seoul, Republic of Korea, unless prohibited by
              applicable law.
            </p>
          </Section>

          <Section title="Account Deletion">
            <p>
              To request deletion of Klorn account data, contact{" "}
              <a
                className="text-accent-deep hover:text-accent-deeper"
                href="mailto:k0820086@gmail.com"
              >
                k0820086@gmail.com
              </a>
              . Deleting Klorn account data does not automatically delete data from Google or other
              third-party services.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              These terms may be updated as Klorn changes. If you continue using Klorn after an
              update, you agree to the updated terms.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For questions about these terms, contact{" "}
              <a
                className="text-accent-deep hover:text-accent-deeper"
                href="mailto:k0820086@gmail.com"
              >
                k0820086@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>
      </article>
    </main>
  );
}
