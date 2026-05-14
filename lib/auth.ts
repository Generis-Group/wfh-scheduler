import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import AtlassianProvider from "next-auth/providers/atlassian";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { encryptedPrismaAdapter } from "@/lib/auth-adapter";
import { getOptionalEnv } from "@/lib/env";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { prisma } from "@/lib/prisma";

const oauthConfig = getOAuthProviderConfig();

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
                scope: "read:jira-user read:jira-work offline_access",
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
                scope:
                  "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly"
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
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;

        if (!email || !password) {
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
          timezone: user.timezone,
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

      if (!user.email) {
        return false;
      }

      const invitedUser = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() }
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
      token.role = dbUser.role;
      token.status = dbUser.status;
      token.timezone = dbUser.timezone;
      token.mustChangePassword = dbUser.mustChangePassword;

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId && token.role && token.status) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.status = token.status;
        session.user.timezone = token.timezone ?? "America/Toronto";
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }

      return session;
    }
  }
};

export function auth() {
  return getServerSession(authOptions);
}
