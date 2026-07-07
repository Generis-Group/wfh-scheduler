import Image from "next/image";

import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import generisLogo from "@/images/Generis_logo.png";

export function AuthLoadingSkeleton({
  fields = 2,
  oauthActions = true,
}: {
  fields?: 2 | 3;
  oauthActions?: boolean;
}) {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-surface-subtle px-3 py-4 dark:bg-background sm:min-h-screen sm:px-4 sm:py-10">
      <div className="flex w-full max-w-md flex-col gap-4 sm:contents">
        <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
          <div className="min-w-0 sm:absolute sm:left-6 sm:top-6">
            <Image
              src={generisLogo}
              alt="Generis"
              className="h-auto w-[min(162px,calc(100vw-5.25rem))] sm:w-[162px]"
              priority
            />
          </div>
          <div className="shrink-0 sm:absolute sm:right-6 sm:top-6">
            <ThemeToggle />
          </div>
        </div>
        <Card
          className="w-full max-w-md shadow-[var(--surface-shadow-strong)]"
          aria-busy="true"
          aria-label="Loading"
        >
          <CardHeader className="space-y-2 px-5 pt-5 text-center">
            <Skeleton className="mx-auto h-8 w-52 rounded-sm" />
            <Skeleton className="h-4 w-72 max-w-full rounded-sm" />
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5">
            {Array.from({ length: fields }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-24 rounded-sm" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
            <Skeleton className="h-10 w-full rounded-md" />
            {oauthActions ? (
              <>
                <div className="space-y-2">
                  <Skeleton className="h-10 rounded-md" />
                  <Skeleton className="h-10 rounded-md" />
                </div>
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-3 w-72 max-w-full rounded-sm" />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
