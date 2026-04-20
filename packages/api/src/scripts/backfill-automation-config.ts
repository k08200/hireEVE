/**
 * Backfill AutomationConfig rows for existing users who signed up before
 * the signup flow started auto-creating one. Without a config row, the
 * scheduler's findMany() skips the user entirely and daily briefings
 * never fire for them.
 *
 * Idempotent — uses createMany with skipDuplicates.
 *
 * Usage: cd packages/api && pnpm tsx src/scripts/backfill-automation-config.ts
 */

import { prisma } from "../db.js";

async function main() {
  const usersMissingConfig = await prisma.user.findMany({
    where: { automationConfig: null },
    select: { id: true, email: true, createdAt: true },
  });

  console.log(`Found ${usersMissingConfig.length} users without AutomationConfig.`);
  if (usersMissingConfig.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.automationConfig.createMany({
    data: usersMissingConfig.map((u) => ({ userId: u.id })),
    skipDuplicates: true,
  });

  console.log(`Created ${result.count} AutomationConfig rows with schema defaults.`);
  for (const u of usersMissingConfig) {
    console.log(`  - ${u.email} (signed up ${u.createdAt.toISOString()})`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
