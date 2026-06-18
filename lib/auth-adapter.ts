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

      return prisma.user.create({
        data: {
          name: user.name,
          email,
          emailVerified: user.emailVerified ?? new Date(),
          image: user.image,
          role: "EMPLOYEE",
          roles: ["EMPLOYEE"],
          status: "ACTIVE",
          mustChangePassword: false
        }
      });
    },
    async linkAccount(account: AdapterAccount) {
      if (!adapter.linkAccount) {
        return null;
      }

      return adapter.linkAccount(encryptAccountTokens(account));
    }
  };
}
