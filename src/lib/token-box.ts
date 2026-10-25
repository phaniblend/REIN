import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

function key() {
  const secret =
    process.env.INTEGRATION_KEY ||
    process.env.AUTH_SECRET ||
    "restman-dev-integration-key";
  return createHash("sha256").update(secret).digest();
}

/** AES-GCM token blob. The key stays in the environment, not the database. */
export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(blob: string) {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

export function signDemoBody(body: string) {
  return createHmac("sha256", key()).update(body).digest("hex");
}

export function verifyDemoSignature(body: string, signature: string | null) {
  if (!signature) return false;
  const expected = signDemoBody(body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
