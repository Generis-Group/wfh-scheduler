import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(error: unknown) {
  if (typeof error === "object" && error !== null && "digest" in error && error.digest === "DYNAMIC_SERVER_USAGE") {
    throw error;
  }

  if (error instanceof HttpError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof ZodError) {
    return jsonError(error.issues.map((issue) => issue.message).join("; "), 422);
  }

  console.error(error);

  return jsonError("Unexpected server error.", 500);
}
