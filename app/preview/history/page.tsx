import { redirect } from "next/navigation";

import { requirePreviewBypass } from "@/lib/preview";

export default function LegacyPreviewHistoryPage() {
  requirePreviewBypass();
  redirect("/preview/reports");
}
