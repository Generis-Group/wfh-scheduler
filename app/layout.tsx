import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Generis Daily Reporting",
  description: "Employee activity reporting for Generis"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var theme=localStorage.getItem("generis-theme");if(theme!=="light"&&theme!=="dark"){theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.style.colorScheme=theme;document.documentElement.dataset.sidebarCollapsed=localStorage.getItem("generis.sidebarCollapsed")==="true"?"true":"false"}catch(error){}})();`
          }}
        />
      </head>
      <body>
        <Providers>
          <div className="min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
