import { redirect } from "next/navigation";

export default function LegacyReviewRedirectPage() {
  redirect("/review");
}
