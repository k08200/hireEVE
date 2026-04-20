import { prisma } from "../db.js";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, plan: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Total users: ${users.length}`);
  for (const u of users) {
    console.log(
      `  [${u.role || "USER"}/${u.plan}] ${u.email} (${u.id.slice(0, 8)}, ${u.createdAt.toISOString().slice(0, 10)})`,
    );
  }
  await prisma.$disconnect();
}
main();
