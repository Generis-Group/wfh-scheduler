import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { loadIntegrationMetadata } from "@/lib/services/integration-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const accounts = await prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true },
    });
    const connected = {
      google: accounts.some((account) => account.provider === "google"),
      atlassian: accounts.some((account) => account.provider === "atlassian"),
    };
    const metadata = await loadIntegrationMetadata(session.user.id, connected);

    return json(metadata, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
