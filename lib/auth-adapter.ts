import type { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type {
  Adapter,
  AdapterAccount,
  AdapterUser,
} from "next-auth/adapters";

import { isGenerisEmail, normalizeEmail } from "@/lib/auth-domain";
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
    async createUser(user: Omit<AdapterUser, "id">) {
      const email = normalizeEmail(user.email);

      if (!email || !isGenerisEmail(email)) {
        throw new Error("Only Generis email addresses can create accounts.");
      }

      throw new Error(
        "Sign up with email and choose a department before using OAuth sign-in.",
      );
    },
    async linkAccount(account: AdapterAccount) {
      if (!adapter.linkAccount) {
        return null;
      }

      return adapter.linkAccount(encryptAccountTokens(account));
    }
  };
}
