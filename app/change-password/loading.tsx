import { AuthLoadingSkeleton } from "@/components/auth/auth-loading-skeleton";

export default function Loading() {
  return <AuthLoadingSkeleton fields={3} oauthActions={false} />;
}
