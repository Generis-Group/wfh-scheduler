import { z } from "zod";

import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Context = {
  params: {
    provider: string;
  };
};

const providerSchema = z.enum(["google", "atlassian"]);

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const provider = providerSchema.parse(params.provider);

    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider
      }
    });

    return json({ disconnected: provider });
  } catch (error) {
    return handleRouteError(error);
  }
}
