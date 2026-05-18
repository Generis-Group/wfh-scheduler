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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var theme=localStorage.getItem("generis-theme");if(theme!=="light"&&theme!=="dark"){theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.style.colorScheme=theme}catch(error){}})();`
          }}
        />
      </head>
      <body>
        <Providers session={session}>
          <div className="min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
