import { requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import type { SyncProgressEvent } from "@/lib/services/sync";
import { syncSchema } from "@/lib/validation";

type SyncResult = {
  importedCount: number;
  skippedCount: number;
  staleCount?: number;
  activities?: unknown[];
  report?: unknown;
};

type SyncRunner = (
  userId: string,
  date: string,
  options?: {
    onProgress?: (event: SyncProgressEvent) => void | Promise<void>;
  },
) => Promise<SyncResult>;

function wantsSyncStream(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

function streamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  data: unknown,
) {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  );
}

function streamErrorData(error: unknown) {
  if (error instanceof HttpError) {
    return { message: error.message, status: error.status };
  }

  console.error(error);

  if (
    process.env.NODE_ENV === "development" &&
    error instanceof Error &&
    error.message
  ) {
    return {
      message: `Import failed: ${error.message}`,
      status: 500,
    };
  }

  return {
    message: "Import failed. Check your connection and try again.",
    status: 500,
  };
}

function syncStreamResponse(runner: SyncRunner, userId: string, date: string) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const result = await withServerTiming(
            "api:sync:stream",
            () =>
              runner(userId, date, {
                onProgress: (event) => {
                  streamEvent(controller, encoder, "progress", event);
                },
              }),
            { date },
          );
          revalidateReportRoutes();
          streamEvent(controller, encoder, "result", result);
        } catch (error) {
          streamEvent(controller, encoder, "error", streamErrorData(error));
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

export async function syncRouteResponse(request: Request, runner: SyncRunner) {
  try {
    const session = await requireSession();
    const input = syncSchema.parse(await request.json());

    if (wantsSyncStream(request)) {
      return syncStreamResponse(runner, session.user.id, input.date);
    }

    const result = await withServerTiming(
      "api:sync:json",
      () => runner(session.user.id, input.date),
      { date: input.date },
    );
    revalidateReportRoutes();

    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
