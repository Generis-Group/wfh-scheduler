import { requireRole } from "@/lib/access";
import { revalidateAdminRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { getCompanySettings, saveCompanySettings } from "@/lib/services/company-settings";
import { companySettingsSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const settings = await getCompanySettings();

    return json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const input = companySettingsSchema.parse(await request.json());
    const settings = await saveCompanySettings(input);
    revalidateAdminRoutes();

    return json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
