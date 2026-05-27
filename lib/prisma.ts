import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function databaseUrlWithConnectionLimit() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return undefined;
  }

  try {
    const url = new URL(databaseUrl);

    if (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      !url.searchParams.has("connection_limit")
    ) {
      url.searchParams.set(
        "connection_limit",
        process.env.PRISMA_CONNECTION_LIMIT?.trim() || "1",
      );
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}

const databaseUrl = databaseUrlWithConnectionLimit();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        }
      : {}),
  });

globalForPrisma.prisma = prisma;
