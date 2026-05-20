import { rmSync } from "node:fs";
import { resolve } from "node:path";

const nextDir = resolve(process.cwd(), ".next");

try {
  rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
} catch (error) {
  console.error("Unable to clear the Next.js dev cache. Stop any running dev server and try again.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
