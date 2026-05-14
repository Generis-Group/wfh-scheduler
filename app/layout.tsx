import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "@/components/providers";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Generis Daily Reporting",
  description: "Employee activity reporting for Generis"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <Providers session={session}>
          <div className="min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
