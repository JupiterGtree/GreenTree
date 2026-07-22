import "server-only";

import { DATA_SOURCES } from "@/config/data-sources";
import { SERVER_ENV } from "@/config/server-env";
import { fetchJson } from "@/services/http/fetch-json";

interface SolanaRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

let requestId = 0;

export async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  requestId += 1;
  const response = await fetchJson<SolanaRpcResponse<T>>(
    SERVER_ENV.solanaRpcUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      cache: "no-store",
    },
    {
      source: "Solana RPC",
      timeoutMs: DATA_SOURCES["solana-rpc"].timeoutMs,
      retries: 1,
    },
  );

  if (response.error || response.result === undefined) {
    throw new Error(response.error?.message || `Solana RPC returned no result for ${method}.`);
  }
  return response.result;
}

export async function solanaRpcBatch<T>(calls: Array<{ method: string; params: unknown[] }>): Promise<T[]> {
  const firstId = requestId + 1;
  requestId += calls.length;
  const body = calls.map((call, index) => ({
    jsonrpc: "2.0",
    id: firstId + index,
    method: call.method,
    params: call.params,
  }));
  const response = await fetchJson<Array<SolanaRpcResponse<T>>>(
    SERVER_ENV.solanaRpcUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
    {
      source: "Solana RPC",
      timeoutMs: DATA_SOURCES["solana-rpc"].timeoutMs,
      retries: 1,
    },
  );
  const byId = new Map(response.map((item) => [item.id, item]));
  return body.map((request) => {
    const item = byId.get(request.id);
    if (!item || item.error || item.result === undefined) {
      throw new Error(item?.error?.message || `Solana RPC returned no result for ${request.method}.`);
    }
    return item.result;
  });
}
