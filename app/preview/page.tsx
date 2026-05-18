import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { requirePreviewBypass } from "@/lib/preview";
import generisLogo from "@/images/Generis_logo.png";

export default function PreviewPage() {
  requirePreviewBypass();

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f4f7fb] px-6 dark:bg-background">
      <div className="absolute left-6 top-6">
        <Image src={generisLogo} alt="Generis" className="h-auto w-[162px]" priority />
      </div>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Preview the reporting app</CardTitle>
          <CardDescription>Use a temporary bypass while authentication and database setup are unfinished.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button asChild className="h-12 bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Link href="/preview/employee">
              View as Employee
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12">
            <Link href="/preview/admin">
              View as Admin/Reviewer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <div className="reference-card-muted flex items-center gap-2 p-3 text-sm text-[#64748b] dark:text-muted-foreground sm:col-span-2">
            <Info className="h-4 w-4 shrink-0 text-[#2563eb]" />
            Preview mode is for development and testing only. Some features are simulated.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
