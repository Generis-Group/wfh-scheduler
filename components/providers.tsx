"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

import { ThemeProvider } from "@/components/theme-provider";

export function Providers({
  children,
  session = null
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  return (
    <ThemeProvider>
      <SessionProvider session={session}>{children}</SessionProvider>
    </ThemeProvider>
  );
}
