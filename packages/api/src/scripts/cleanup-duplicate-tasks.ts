/**
 * Cleanup duplicate open tasks for a user.
 *
 * Usage:
 *   DRY-RUN (default):  pnpm tsx src/scripts/cleanup-duplicate-tasks.ts <userId>
 *   EXECUTE DELETE:     CONFIRM=1 pnpm tsx src/scripts/cleanup-duplicate-tasks.ts <userId>
 *
 * Groups open (TODO/IN_PROGRESS) tasks by shared title keywords and keeps the
 * oldest task per cluster, deletes the rest. Prints a full preview before any
 * destructive action.
 */
import { prisma } from "../db.js";

const KEYWORD_THRESHOLD = 3;

function normalize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[[\]()'"“”‘’`~!@#$%^&*_+=<>?,./\\|{}:;]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

type OpenTask = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
};

type Cluster = {
  keeper: OpenTask;
  duplicates: OpenTask[];
  sharedKeywords: string[];
};

function clusterTasks(tasks: OpenTask[]): Cluster[] {
  const ordered = [...tasks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const keywords = ordered.map((t) => new Set(normalize(t.title)));
  const assigned = new Array(ordered.length).fill(false);
  const clusters: Cluster[] = [];

  for (let i = 0; i < ordered.length; i++) {
    if (assigned[i]) continue;
    assigned[i] = true;
    const cluster: Cluster = {
      keeper: ordered[i],
      duplicates: [],
      sharedKeywords: [...keywords[i]],
    };
    for (let j = i + 1; j < ordered.length; j++) {
      if (assigned[j]) continue;
      if (sharedCount(keywords[i], keywords[j]) >= KEYWORD_THRESHOLD) {
        assigned[j] = true;
        cluster.duplicates.push(ordered[j]);
      }
    }
    if (cluster.duplicates.length > 0) clusters.push(cluster);
  }
  return clusters;
}

async function main() {
  const userId = process.argv[2];
  const confirm = process.env.CONFIRM === "1";
  if (!userId) {
    console.error("Usage: cleanup-duplicate-tasks.ts <userId>  (set CONFIRM=1 to delete)");
    process.exit(1);
  }

  const openTasks = await prisma.task.findMany({
    where: { userId, status: { in: ["TODO", "IN_PROGRESS"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, status: true, createdAt: true },
  });

  console.log(`\nUser ${userId}: ${openTasks.length} open tasks\n`);

  const clusters = clusterTasks(openTasks);
  if (clusters.length === 0) {
    console.log("No duplicate clusters detected. Nothing to clean up.");
    return;
  }

  let totalDupes = 0;
  for (const cluster of clusters) {
    console.log(`── Cluster (keep ${cluster.keeper.id}) ──`);
    console.log(`  KEEP:   [${cluster.keeper.createdAt.toISOString()}] ${cluster.keeper.title}`);
    for (const d of cluster.duplicates) {
      console.log(`  DELETE: [${d.createdAt.toISOString()}] ${d.title}`);
      totalDupes++;
    }
    console.log("");
  }

  console.log(`\nSummary: ${clusters.length} clusters, ${totalDupes} duplicates to delete.`);

  if (!confirm) {
    console.log("\nDRY RUN — re-run with CONFIRM=1 to actually delete.");
    return;
  }

  const idsToDelete = clusters.flatMap((c) => c.duplicates.map((d) => d.id));
  const result = await prisma.task.deleteMany({ where: { id: { in: idsToDelete } } });
  console.log(`\nDeleted ${result.count} duplicate tasks.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
