import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("token encryption", () => {
  it("round-trips provider tokens", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

    const encrypted = encryptSecret("access-token-value");

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptSecret(encrypted)).toBe("access-token-value");
  });

  it("does not double encrypt values", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

    const encrypted = encryptSecret("refresh-token-value");

    expect(encryptSecret(encrypted)).toBe(encrypted);
  });
});
