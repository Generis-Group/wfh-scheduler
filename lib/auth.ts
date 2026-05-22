import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import AtlassianProvider from "next-auth/providers/atlassian";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { cache } from "react";

import { encryptedPrismaAdapter } from "@/lib/auth-adapter";
import { isGenerisEmail, normalizeEmail } from "@/lib/auth-domain";
import { getOptionalEnv } from "@/lib/env";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { ATLASSIAN_OAUTH_SCOPE, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";
import { prisma } from "@/lib/prisma";

const oauthConfig = getOAuthProviderConfig();

function imageSafeForSessionCookie(image?: string | null) {
  if (!image || image.startsWith("data:")) {
    return null;
  }

  return image;
}

export const authOptions: NextAuthOptions = {
  adapter: encryptedPrismaAdapter(prisma),
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    ...(oauthConfig.atlassian
      ? [
          AtlassianProvider({
            clientId: getOptionalEnv("ATLASSIAN_CLIENT_ID")!,
            clientSecret: getOptionalEnv("ATLASSIAN_CLIENT_SECRET")!,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                audience: "api.atlassian.com",
                scope: ATLASSIAN_OAUTH_SCOPE,
                prompt: "consent"
              }
            }
          })
        ]
      : []),
    ...(oauthConfig.google
      ? [
          GoogleProvider({
            clientId: getOptionalEnv("GOOGLE_CLIENT_ID")!,
            clientSecret: getOptionalEnv("GOOGLE_CLIENT_SECRET")!,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                access_type: "offline",
                prompt: "consent",
                scope: GOOGLE_OAUTH_SCOPE
              }
            }
          })
        ]
      : []),
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email);
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        if (!isGenerisEmail(email)) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user?.passwordHash || user.status === "DISABLED") {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          status: user.status,
          mustChangePassword: user.mustChangePassword
        };
      }
    })
  ],
  callbacks: {
    async signIn({ account, user }) {
      if (account?.provider === "credentials") {
        return true;
      }

      if (account?.provider && account.providerAccountId) {
        const linkedAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId
            }
          },
          select: {
            user: {
              select: { status: true }
            }
          }
        });

        if (linkedAccount) {
          return linkedAccount.user.status !== "DISABLED" && isGenerisEmail(user.email);
        }
      }

      if (!isGenerisEmail(user.email)) {
        return false;
      }

      const invitedUser = await prisma.user.findUnique({
        where: { email: normalizeEmail(user.email) }
      });

      return Boolean(invitedUser && invitedUser.status !== "DISABLED");
    },
    async jwt({ token, user }) {
      const userId = user?.id ?? token.userId;

      if (!userId) {
        return token;
      }

      const dbUser = await prisma.user.findUnique({ where: { id: userId } });

      if (!dbUser) {
        return token;
      }

      token.userId = dbUser.id;
      token.name = dbUser.name;
      token.email = dbUser.email;
      token.picture = imageSafeForSessionCookie(dbUser.image);
      token.role = dbUser.role;
      token.status = dbUser.status;
      token.mustChangePassword = dbUser.mustChangePassword;

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId && token.role && token.status) {
        session.user.id = token.userId;
        session.user.name = token.name ?? null;
        session.user.email = token.email ?? null;
        session.user.image = token.picture ?? null;
        session.user.role = token.role;
        session.user.status = token.status;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }

      return session;
    }
  }
};

export const auth = cache(() => getServerSession(authOptions));
