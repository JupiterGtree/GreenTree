import "server-only";

interface FetchJsonOptions {
  source: string;
  timeoutMs: number;
  retries?: number;
  failureLog?: "error" | "warn" | "none";
}

export type ExternalRequestOutcome =
  | "success"
  | "timeout"
  | "aborted-by-client"
  | "invalid"
  | "HTTP error"
  | "network";

export class ExternalRequestError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly outcome: Exclude<ExternalRequestOutcome, "success">,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ExternalRequestError";
  }
}

function isTransientHttpStatus(status: number) {
  return status === 429 || status >= 500;
}

function classifyFetchError(error: unknown, source: string): ExternalRequestError {
  if (error instanceof ExternalRequestError) return error;

  if (error instanceof Error && error.name === "AbortError") {
    return new ExternalRequestError(`${source} timed out.`, source, "timeout", null, true);
  }

  if (error instanceof TypeError) {
    return new ExternalRequestError(`${source} is temporarily unavailable.`, source, "network", null, true);
  }

  const message = error instanceof Error ? error.message : "Unknown source error";
  const httpMatch = message.match(/HTTP (\d+)/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    return new ExternalRequestError(
      `${source} returned HTTP ${status}.`,
      source,
      "HTTP error",
      status,
      isTransientHttpStatus(status),
    );
  }

  return new ExternalRequestError(
    `${source} is temporarily unavailable.`,
    source,
    "invalid",
    null,
    false,
  );
}

export async function fetchJson<T>(
  input: string,
  init: RequestInit,
  { source, timeoutMs, retries = 0, failureLog = "error" }: FetchJsonOptions,
): Promise<T> {
  let lastError: ExternalRequestError | undefined;
  const externalAbort = init.signal;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (externalAbort?.aborted) {
      throw new ExternalRequestError(`${source} aborted by client.`, source, "aborted-by-client", null, false);
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    externalAbort?.addEventListener("abort", onExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ExternalRequestError(
          `${source} returned HTTP ${response.status}.`,
          source,
          "HTTP error",
          response.status,
          isTransientHttpStatus(response.status),
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (externalAbort?.aborted) {
        throw new ExternalRequestError(`${source} aborted by client.`, source, "aborted-by-client", null, false);
      }
      lastError = classifyFetchError(error, source);
      if (attempt < retries && lastError.retryable) continue;
    } finally {
      clearTimeout(timeout);
      externalAbort?.removeEventListener("abort", onExternalAbort);
    }
  }

  const failure = lastError ?? new ExternalRequestError(`${source} is temporarily unavailable.`, source, "network", null, true);
  if (failure.outcome !== "aborted-by-client" && failureLog !== "none") {
    const log = failureLog === "warn" ? console.warn : console.error;
    log(JSON.stringify({
      event: "external_request_failed",
      source,
      outcome: failure.outcome,
      status: failure.status,
      ...(failureLog === "error" ? { message: failure.message } : {}),
    }));
  }
  throw failure;
}
