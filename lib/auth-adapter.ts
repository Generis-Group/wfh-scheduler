import type { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";

import { encryptSecret } from "@/lib/crypto";

function encryptAccountTokens(account: AdapterAccount): AdapterAccount {
  return {
    ...account,
    access_token: encryptSecret(account.access_token) ?? undefined,
    refresh_token: encryptSecret(account.refresh_token) ?? undefined,
    id_token: encryptSecret(account.id_token) ?? undefined
  };
}

export function encryptedPrismaAdapter(prisma: PrismaClient): Adapter {
  const adapter = PrismaAdapter(prisma);

  return {
    ...adapter,
    async linkAccount(account: AdapterAccount) {
      if (!adapter.linkAccount) {
        return null;
      }

      return adapter.linkAccount(encryptAccountTokens(account));
    }
  };
}
