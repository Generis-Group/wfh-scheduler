import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { handleRouteError, HttpError } from "@/lib/http";

describe("route error handling", () => {
  it("preserves expected HttpError messages", async () => {
    const response = handleRouteError(new HttpError(403, "Forbidden for test."));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden for test." });
  });

  it("preserves zod validation messages", async () => {
    const parsed = z.object({ name: z.string().min(3) }).safeParse({ name: "" });

    if (parsed.success) {
      throw new Error("Expected validation failure.");
    }

    const response = handleRouteError(parsed.error);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Too small") });
  });

  it("hides unexpected server error details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = handleRouteError(new Error("database password leaked in stack"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unexpected server error." });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
