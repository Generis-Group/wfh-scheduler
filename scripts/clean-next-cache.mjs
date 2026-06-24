import { rmSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const devPort = Number.parseInt(process.env.PORT ?? "3000", 10);
const nextDir = resolve(process.cwd(), ".next");

async function portIsAvailable(port) {
  if (!Number.isInteger(port) || port <= 0) {
    return true;
  }

  return new Promise((resolveAvailability) => {
    const server = createServer();

    server.once("error", (error) => {
      resolveAvailability(error.code !== "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolveAvailability(true));
    });
    server.listen(port);
  });
}

if (!(await portIsAvailable(devPort))) {
  console.error(
    `Port ${devPort} is already in use. Stop the running dev server before starting a new one.`,
  );
  console.error(
    "The Next.js cache was not cleared, so the existing server keeps its matching chunks.",
  );
  process.exit(1);
}

try {
  rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
} catch (error) {
  console.error("Unable to clear the Next.js dev cache. Stop any running dev server and try again.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
