import crypto from "crypto";

const PREFIX = "enc:v1";

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function getEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required to encrypt provider tokens.");
  }

  const base64 = Buffer.from(secret, "base64");
  if (base64.length === 32) {
    return base64;
  }

  const hex = Buffer.from(secret, "hex");
  if (hex.length === 32) {
    return hex;
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value?: string | null) {
  if (!value) {
    return value ?? null;
  }

  if (value.startsWith(`${PREFIX}:`)) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join(":");
}

export function decryptSecret(value?: string | null) {
  if (!value) {
    return value ?? null;
  }

  if (!value.startsWith(`${PREFIX}:`)) {
    return value;
  }

  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), fromBase64Url(ivValue));
  decipher.setAuthTag(fromBase64Url(tagValue));

  return Buffer.concat([
    decipher.update(fromBase64Url(encryptedValue)),
    decipher.final()
  ]).toString("utf8");
}
