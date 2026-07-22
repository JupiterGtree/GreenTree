import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_VERSION = 1;
const SCRYPT_N = 131_072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashAdminPassword(password: string): string {
  assertPasswordInput(password);
  const salt = randomBytes(16);
  const derived = derivePasswordKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    "scrypt",
    `v=${SCRYPT_VERSION}`,
    `N=${SCRYPT_N}`,
    `r=${SCRYPT_R}`,
    `p=${SCRYPT_P}`,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export function verifyAdminPassword(password: string, encodedHash: string): boolean {
  try {
    assertPasswordInput(password);
    const parts = encodedHash.split("$");
    if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== `v=${SCRYPT_VERSION}`) {
      return false;
    }

    const n = parseParameter(parts[2], "N");
    const r = parseParameter(parts[3], "r");
    const p = parseParameter(parts[4], "p");
    if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;

    const salt = Buffer.from(parts[5], "base64url");
    const expected = Buffer.from(parts[6], "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

    const actual = derivePasswordKey(password, salt, n, r, p);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function isValidAdminPasswordHash(encodedHash: string): boolean {
  try {
    const parts = encodedHash.split("$");
    if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== `v=${SCRYPT_VERSION}`) {
      return false;
    }
    if (
      parseParameter(parts[2], "N") !== SCRYPT_N ||
      parseParameter(parts[3], "r") !== SCRYPT_R ||
      parseParameter(parts[4], "p") !== SCRYPT_P
    ) {
      return false;
    }
    return (
      Buffer.from(parts[5], "base64url").length === 16 &&
      Buffer.from(parts[6], "base64url").length === SCRYPT_KEY_LENGTH &&
      /^[A-Za-z0-9_-]+$/.test(parts[5]) &&
      /^[A-Za-z0-9_-]+$/.test(parts[6])
    );
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function generateCsrfSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function createCsrfToken(csrfSecret: string, sessionTokenHash: string): string {
  return createHmac("sha256", csrfSecret).update(sessionTokenHash, "utf8").digest("base64url");
}

export function verifyCsrfToken(
  suppliedToken: string,
  csrfSecret: string,
  sessionTokenHash: string,
): boolean {
  const expected = Buffer.from(createCsrfToken(csrfSecret, sessionTokenHash));
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function hmacIpAddress(ipAddress: string, secret: string): string {
  if (secret.length < 32) throw new Error("ADMIN_IP_HMAC_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(ipAddress.trim() || "unknown", "utf8").digest("base64url");
}

export function hashUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  return createHash("sha256").update(userAgent, "utf8").digest("base64url");
}

function derivePasswordKey(password: string, salt: Buffer, n: number, r: number, p: number): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: n,
    r,
    p,
    maxmem: SCRYPT_MAX_MEMORY,
  });
}

function assertPasswordInput(password: string): void {
  const byteLength = Buffer.byteLength(password, "utf8");
  if (byteLength < 1 || byteLength > 1_024) {
    throw new Error("Password must contain between 1 and 1024 UTF-8 bytes.");
  }
}

function parseParameter(value: string, name: string): number {
  if (!value.startsWith(`${name}=`)) throw new Error("Invalid password hash.");
  const parsed = Number(value.slice(name.length + 1));
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Invalid password hash.");
  return parsed;
}
