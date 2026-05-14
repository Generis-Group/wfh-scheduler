import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { userIntegrationSettingsSchema } from "@/lib/validation";

export async function GET() {
  try {
    const session = await requireSession();
    const settings = await prisma.userIntegrationSettings.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id, googleTaskListIds: [] }
    });

    return json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const input = userIntegrationSettingsSchema.parse(await request.json());
    const settings = await prisma.userIntegrationSettings.upsert({
      where: { userId: session.user.id },
      update: input,
      create: {
        userId: session.user.id,
        googleTaskListIds: input.googleTaskListIds ?? [],
        googleCalendarId: input.googleCalendarId ?? "primary",
        jiraCloudId: input.jiraCloudId ?? null
      }
    });

    return json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
