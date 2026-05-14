import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PreviewPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-6">
      <Card className="w-full max-w-lg border-[#d9e1ec]">
        <CardHeader>
          <CardTitle>Preview the reporting app</CardTitle>
          <CardDescription>Use a temporary bypass while authentication and database setup are unfinished.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button asChild className="h-12 bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Link href="/preview/employee">
              View as Employee
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 border-[#d9e1ec]">
            <Link href="/preview/admin">
              View as Admin/Reviewer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
