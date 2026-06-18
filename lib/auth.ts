import bcrypt from "bcryptjs";
import type { UserStatus } from "@prisma/client";
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
import { normalizeUserRoles, primaryUserRole } from "@/lib/roles";

const oauthConfig = getOAuthProviderConfig();

function imageSafeForSessionCookie(image?: string | null) {
  if (!image || image.startsWith("data:")) {
    return null;
  }

  return image;
}

function profileEmail(profile: unknown) {
  if (!profile || typeof profile !== "object" || !("email" in profile)) {
    return "";
  }

  const email = (profile as { email?: unknown }).email;

  return typeof email === "string" ? normalizeEmail(email) : "";
}

function profileEmailVerified(provider: string | undefined, profile: unknown) {
  if (!profile || typeof profile !== "object") {
    return false;
  }

  const explicitVerification = (profile as { email_verified?: unknown })
    .email_verified;

  if (explicitVerification !== undefined) {
    return explicitVerification === true || explicitVerification === "true";
  }

  return provider === "atlassian" && Boolean(profileEmail(profile));
}

async function activateOAuthUser(user: {
  id: string;
  status: UserStatus;
  emailVerified?: Date | null;
  mustChangePassword?: boolean | null;
}) {
  if (
    user.status !== "INVITED" &&
    user.emailVerified &&
    !user.mustChangePassword
  ) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: user.status === "INVITED" ? "ACTIVE" : user.status,
      emailVerified: user.emailVerified ?? new Date(),
      mustChangePassword: false
    }
  });
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
          role: primaryUserRole(user),
          roles: normalizeUserRoles(user),
          status: user.status,
          mustChangePassword: user.mustChangePassword
        };
      }
    })
  ],
  callbacks: {
    async signIn({ account, user, profile }) {
      if (account?.provider === "credentials") {
        return true;
      }

      const oauthEmail = profileEmail(profile);

      if (!isGenerisEmail(oauthEmail)) {
        return false;
      }

      if (!profileEmailVerified(account?.provider, profile)) {
        return false;
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
              select: {
                id: true,
                email: true,
                status: true,
                emailVerified: true,
                mustChangePassword: true
              }
            }
          }
        });

        if (linkedAccount) {
          const linkedEmail = normalizeEmail(linkedAccount.user.email);
          const canSignIn =
            linkedAccount.user.status !== "DISABLED" &&
            linkedEmail === oauthEmail &&
            isGenerisEmail(linkedEmail);

          if (canSignIn) {
            await activateOAuthUser(linkedAccount.user);
          }

          return canSignIn;
        }
      }

      const invitedUser = await prisma.user.findUnique({
        where: { email: oauthEmail },
        select: {
          id: true,
          email: true,
          status: true,
          emailVerified: true,
          mustChangePassword: true
        }
      });

      if (!invitedUser) {
        return true;
      }

      const canSignIn =
        invitedUser.status !== "DISABLED" &&
        normalizeEmail(invitedUser.email) === oauthEmail;

      if (canSignIn) {
        await activateOAuthUser(invitedUser);
      }

      return canSignIn;
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
      token.roles = normalizeUserRoles(dbUser);
      token.role = primaryUserRole(dbUser);
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
        session.user.roles = token.roles?.length ? token.roles : [token.role];
        session.user.status = token.status;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }

      return session;
    }
  }
};

export const auth = cache(() => getServerSession(authOptions));
