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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[#f4f7fb] px-3 py-4 dark:bg-background sm:min-h-screen sm:px-4 sm:py-10">
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
          className="w-full max-w-md"
          aria-busy="true"
          aria-label="Loading"
        >
          <CardHeader className="items-center text-center">
            <Skeleton className="h-7 w-52 rounded-[4px]" />
            <Skeleton className="h-4 w-72 max-w-full rounded-[4px]" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: fields }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-24 rounded-[4px]" />
                <Skeleton className="h-10 w-full rounded-[7px]" />
              </div>
            ))}
            <Skeleton className="h-10 w-full rounded-[7px]" />
            {oauthActions ? (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Skeleton className="h-10 rounded-[7px]" />
                  <Skeleton className="h-10 rounded-[7px]" />
                </div>
                <Skeleton className="h-3 w-56 rounded-[4px]" />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
