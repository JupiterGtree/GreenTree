/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { Module } from "node:module";

const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...args] as any);
};

import assert from "node:assert/strict";
import test from "node:test";
import type { HealthCheck } from "../src/lib/admin/system-health";

const { ENV, GTREE_POOL_ADDRESS, WRAPPED_SOL_MINT } =
  require("../src/lib/constants/env") as typeof import("../src/lib/constants/env");
const { PROJECT } = require("../src/lib/constants/project") as typeof import("../src/lib/constants/project");
const { jupiterCheck, meteoraCheck, rpcCheck, settleHealthChecks } =
  require("../src/lib/admin/system-health") as typeof import("../src/lib/admin/system-health");
const { fetchJson } =
  require("../src/services/http/fetch-json") as typeof import("../src/services/http/fetch-json");
const {
  buildSystemHealthPageModel,
  createRefreshGuard,
} = require("../src/app/admin/(protected)/system/system-health-model") as
  typeof import("../src/app/admin/(protected)/system/system-health-model");

const originalFetch = globalThis.fetch;

function mockFetch(t: test.TestContext, implementation: typeof fetch): void {
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jupiterQuote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    inputMint: WRAPPED_SOL_MINT,
    outputMint: PROJECT.mint,
    inAmount: "1000000",
    outAmount: "42",
    routePlan: [{}],
    ...overrides,
  };
}

function meteoraPool(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    address: GTREE_POOL_ADDRESS,
    name: "GTREE-SOL",
    current_price: 0.0001,
    token_x: { address: ENV.gtreeMint },
    token_y: { address: WRAPPED_SOL_MINT, price: 150 },
    token_x_amount: 10,
    token_y_amount: 20,
    volume: { "24h": 30 },
    fees: { "24h": 1 },
    tvl: 40,
    is_blacklisted: false,
    ...overrides,
  };
}

function silenceWarnings(t: test.TestContext): string[] {
  const messages: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => messages.push(String(message));
  t.after(() => {
    console.warn = originalWarn;
  });
  return messages;
}

test("RPC healthy response resolves HEALTHY", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse({ result: "ok" }));
  assert.equal((await rpcCheck()).status, "HEALTHY");
});

test("RPC timeout resolves UNAVAILABLE", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => {
    throw new DOMException("timed out at https://secret.invalid", "AbortError");
  });
  assert.equal((await rpcCheck()).status, "UNAVAILABLE");
});

test("HTTP 429 resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse({ message: "limited" }, 429));
  assert.equal((await rpcCheck()).status, "DEGRADED");
});

test("HTTP 5xx resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse({ message: "failed" }, 503));
  assert.equal((await jupiterCheck()).status, "DEGRADED");
});

test("network failure resolves UNAVAILABLE", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => {
    throw new TypeError("request to https://secret.invalid failed");
  });
  assert.equal((await jupiterCheck()).status, "UNAVAILABLE");
});

test("invalid JSON resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => new Response("{", { status: 200 }));
  assert.equal((await rpcCheck()).status, "DEGRADED");
});

test("malformed RPC mapping resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse({ result: 7 }));
  assert.equal((await rpcCheck()).status, "DEGRADED");
});

test("usable Jupiter route resolves HEALTHY", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse(jupiterQuote()));
  assert.equal((await jupiterCheck()).status, "HEALTHY");
});

test("malformed Jupiter mapping resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse(jupiterQuote({ outAmount: "0", routePlan: [] })));
  assert.equal((await jupiterCheck()).status, "DEGRADED");
});

test("valid Meteora pool resolves HEALTHY", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse(meteoraPool()));
  assert.equal((await meteoraCheck()).status, "HEALTHY");
});

test("Meteora timeout resolves UNAVAILABLE", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => {
    throw new DOMException("timed out at https://private.example", "AbortError");
  });
  const result = await meteoraCheck();
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.retryable, true);
  assert.equal(JSON.stringify(result).includes("private.example"), false);
});

test("Meteora HTTP 429 resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse({}, 429));
  const result = await meteoraCheck();
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.retryable, true);
});

test("Meteora HTTP 500 resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse({}, 500));
  const result = await meteoraCheck();
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.retryable, true);
});

test("malformed Meteora mapping resolves DEGRADED", async (t) => {
  silenceWarnings(t);
  mockFetch(t, async () => jsonResponse(meteoraPool({ current_price: "bad" })));
  assert.equal((await meteoraCheck()).status, "DEGRADED");
});

test("settled aggregation preserves completed checks and contains rejection", async (t) => {
  silenceWarnings(t);
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (message?: unknown) => errors.push(String(message));
  t.after(() => {
    console.error = originalError;
  });
  const complete: HealthCheck = {
    key: "rpc",
    label: "Solana RPC",
    status: "HEALTHY",
    detail: "Completed.",
    latencyMs: 1,
    checkedAt: 1,
    retryable: false,
  };
  const checks = await settleHealthChecks([
    { key: "rpc", label: "Solana RPC", run: async () => complete },
    { key: "jupiter", label: "Jupiter", run: async () => {
      throw new Error("https://secret.invalid private failure");
    } },
  ]);
  assert.deepEqual(checks[0], complete);
  assert.equal(checks[1].status, "UNKNOWN");
  assert.equal(JSON.stringify(checks).includes("secret.invalid"), false);
  assert.equal(JSON.stringify(checks).includes("private failure"), false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].includes("secret.invalid"), false);
});

test("health failures emit sanitized warnings and suppress console.error", async (t) => {
  const warnings = silenceWarnings(t);
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (message?: unknown) => errors.push(String(message));
  t.after(() => {
    console.error = originalError;
  });
  mockFetch(t, async () => {
    throw new TypeError("request to https://credential.example/token failed");
  });

  await rpcCheck();
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].includes("credential.example"), false);
  assert.equal(warnings[0].includes("message"), false);
});

test("strict fetchJson callers retain console.error and thrown failure", async (t) => {
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (message?: unknown) => errors.push(String(message));
  t.after(() => {
    console.error = originalError;
  });
  mockFetch(t, async () => {
    throw new TypeError("network failed");
  });

  await assert.rejects(
    fetchJson("https://strict.invalid", {}, { source: "Strict purchase source", timeoutMs: 50 }),
    /temporarily unavailable/,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /external_request_failed/);
});

test("page model adopts latest timestamp and results without mutating previous results", () => {
  const previous: HealthCheck[] = [{
    key: "rpc",
    label: "Solana RPC",
    status: "HEALTHY",
    detail: "Previous.",
    latencyMs: 1,
    checkedAt: 100,
    retryable: false,
  }];
  const latest: HealthCheck[] = [{ ...previous[0], status: "DEGRADED", detail: "Latest." }];
  const first = buildSystemHealthPageModel(100, previous);
  const second = buildSystemHealthPageModel(200, latest);
  assert.equal(first.checkedAt, 100);
  assert.equal(first.checks[0].status, "HEALTHY");
  assert.equal(second.checkedAt, 200);
  assert.equal(second.checks[0].status, "DEGRADED");
});

test("all unavailable providers still produce a renderable page model", () => {
  const checkedAt = 300;
  const checks: HealthCheck[] = ["rpc", "jupiter", "meteora"].map((key) => ({
    key: key as "rpc" | "jupiter" | "meteora",
    label: key,
    status: "UNAVAILABLE",
    detail: "Provider health check is unavailable.",
    latencyMs: null,
    checkedAt,
    retryable: true,
  }));
  const model = buildSystemHealthPageModel(checkedAt, checks);
  assert.equal(model.summary, "Some services unavailable");
  assert.equal(model.checks.length, 3);
  assert.equal(JSON.stringify(model).includes("Error"), false);
});

test("refresh guard rejects overlap until the active refresh finishes", () => {
  const guard = createRefreshGuard();
  assert.equal(guard.tryStart(), true);
  assert.equal(guard.isRunning(), true);
  assert.equal(guard.tryStart(), false);
  guard.finish();
  assert.equal(guard.tryStart(), true);
});
