import { revalidatePath } from "next/cache";

export function revalidatePaths(paths: string[]) {
  for (const path of paths) {
    revalidatePath(path);
  }
}

export function revalidateReportRoutes() {
  revalidatePaths(["/", "/reports", "/review"]);
}

export function revalidateSettingsRoutes() {
  revalidatePaths(["/", "/settings"]);
}

export function revalidateAdminRoutes() {
  revalidatePaths(["/admin", "/review", "/settings"]);
}
