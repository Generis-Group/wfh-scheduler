import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { companySettingsSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const setting = await prisma.appSetting.findUnique({ where: { key: "company" } });

    return json({
      settings: setting?.value ?? {
        jiraProjectKeys: []
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const input = companySettingsSchema.parse(await request.json());
    const setting = await prisma.appSetting.upsert({
      where: { key: "company" },
      update: { value: input },
      create: { key: "company", value: input }
    });

    return json({ settings: setting.value });
  } catch (error) {
    return handleRouteError(error);
  }
}
