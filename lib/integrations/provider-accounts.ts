import { decryptSecret } from "@/lib/crypto";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function getProviderAccount(userId: string, provider: "google" | "atlassian") {
  const account = await prisma.account.findFirst({
    where: { userId, provider }
  });

  if (!account?.access_token) {
    throw new HttpError(409, `Connect ${provider} before syncing.`);
  }

  return {
    ...account,
    accessToken: decryptSecret(account.access_token),
    refreshToken: decryptSecret(account.refresh_token),
    idToken: decryptSecret(account.id_token)
  };
}
