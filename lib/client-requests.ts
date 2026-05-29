export async function responseErrorMessage(
  response: Response,
  fallback: string,
) {
  const body = await response.json().catch(() => null);
  return body && typeof body.error === "string" ? body.error : fallback;
}

type ServerSentEventHandlers = {
  onEvent: (event: string, data: unknown) => void;
};

function parseServerSentEvent(rawEvent: string) {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || event;
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return { event, data: null };
  }

  const data = dataLines.join("\n");

  try {
    return { event, data: JSON.parse(data) as unknown };
  } catch {
    return { event, data };
  }
}

export async function readServerSentEvents(
  response: Response,
  handlers: ServerSentEventHandlers,
) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("The server did not return a readable stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const parsed = parseServerSentEvent(rawEvent);
      handlers.onEvent(parsed.event, parsed.data);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    const parsed = parseServerSentEvent(buffer);
    handlers.onEvent(parsed.event, parsed.data);
  }
}
