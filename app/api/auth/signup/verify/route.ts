import { NextResponse } from "next/server";

import { verifySelfServiceSignup } from "@/lib/services/account-auth";

function loginRedirect(request: Request, searchParams: Record<string, string>) {
  const url = new URL("/login", request.url);

  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return loginRedirect(request, { signupError: "missing" });
  }

  try {
    await verifySelfServiceSignup({ email, token });

    return loginRedirect(request, { verified: "1" });
  } catch {
    return loginRedirect(request, { signupError: "invalid" });
  }
}
