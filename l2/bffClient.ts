/// <mls fileReference="_102029_/l2/bffClient.ts" enhancement="_blank" />
import type { MasterFrontendInteractionMode, MasterFrontendNormalizedError } from '/_102029_/l2/contracts/bootstrap.js';
import { telemetryQueue, type ClientTelemetryEvent } from '/_102029_/l2/telemetry.js';

export type { ClientTelemetryEvent };

function traceLazy(event: string, details?: Record<string, unknown>) {
  if (!globalThis.window || !window.isTraceLazy) {
    return;
  }
  console.log('[traceLazy][bff-client]', event, details ?? {});
}

export interface BffClientOptions {
  mode?: MasterFrontendInteractionMode;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BffClientResponse<TData = unknown> {
  ok: boolean;
  data: TData | null;
  error: MasterFrontendNormalizedError | null;
  telemetryReceived?: number;
}

export interface BffClientRequest {
  routine: string;
  params: unknown;
  meta: {
    source: 'http' | 'test';
    userId: string;
    telemetry: ClientTelemetryEvent[];
  };
}

export type BffDirectResult<TData = unknown> =
  | BffClientResponse<TData>
  | {
      response: BffClientResponse<TData>;
      statusCode?: number;
    };

export interface BffDirectTransport {
  execBff<TData = unknown>(
    request: BffClientRequest,
    options?: BffClientOptions,
  ): Promise<BffDirectResult<TData>>;
}

declare global {
  interface Window {
    collabBffTransport?: BffDirectTransport;
    collabBffTransportModule?: string;
  }
}

let _userId = 'anonymous';
let importedTransportUrl: string | null = null;
let importedTransport: Promise<BffDirectTransport> | null = null;

export function setUserId(id: string): void {
  _userId = id;
  telemetryQueue.setUserId(id);
}

export function pushTelemetry(event: ClientTelemetryEvent): void {
  telemetryQueue.push(event);
}

const DEFAULT_TIMEOUT_MS = 10000;

function getBffHost() {
  return globalThis as typeof globalThis & {
    collabBffTransport?: BffDirectTransport;
    collabBffTransportModule?: string;
    window?: Window;
  };
}

function getRegisteredTransport(): BffDirectTransport | null {
  const host = getBffHost();
  return host.window?.collabBffTransport ?? host.collabBffTransport ?? null;
}

function getTransportModuleUrl(): string | null {
  const host = getBffHost();
  return host.window?.collabBffTransportModule ?? host.collabBffTransportModule ?? null;
}

function normalizeTransportModule(mod: unknown): BffDirectTransport {
  const record = mod as {
    default?: unknown;
    execBff?: unknown;
  };
  const exported = record.default ?? record;

  if (typeof exported === 'function') {
    return {
      execBff: exported as BffDirectTransport['execBff'],
    };
  }

  if (exported && typeof exported === 'object' && typeof (exported as BffDirectTransport).execBff === 'function') {
    return exported as BffDirectTransport;
  }

  if (typeof record.execBff === 'function') {
    return {
      execBff: record.execBff as BffDirectTransport['execBff'],
    };
  }

  throw new Error('BFF transport module must export execBff or a default transport');
}

async function resolveDirectTransport(): Promise<BffDirectTransport | null> {
  const registered = getRegisteredTransport();
  if (registered) {
    return registered;
  }

  const moduleUrl = getTransportModuleUrl();
  if (!moduleUrl) {
    return null;
  }

  if (!importedTransport || importedTransportUrl !== moduleUrl) {
    importedTransportUrl = moduleUrl;
    importedTransport = import(moduleUrl)
      .then(normalizeTransportModule)
      .catch((error) => {
        if (importedTransportUrl === moduleUrl) {
          importedTransportUrl = null;
          importedTransport = null;
        }
        throw error;
      });
  }

  return importedTransport;
}

function createRequest(
  routine: string,
  params: unknown,
  source: BffClientRequest['meta']['source'],
): BffClientRequest {
  return {
    routine,
    params,
    meta: {
      source,
      userId: _userId,
      telemetry: telemetryQueue.flush(),
    },
  };
}

function unwrapDirectResult<TData>(result: BffDirectResult<TData>): BffClientResponse<TData> {
  if (result && typeof result === 'object' && 'response' in result) {
    return result.response;
  }
  return result as BffClientResponse<TData>;
}

function withAbort<TValue>(operation: Promise<TValue>, signal: AbortSignal): Promise<TValue> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('aborted'));
  }

  return new Promise<TValue>((resolve, reject) => {
    const handleAbort = () => {
      reject(signal.reason ?? new Error('aborted'));
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', handleAbort);
      });
  });
}

export async function execBff<TData = unknown>(
  routine: string,
  params: unknown,
  options: BffClientOptions = {},
): Promise<BffClientResponse<TData>> {
  const controller = new AbortController();
  const cleanupTimeout = globalThis.setTimeout(() => {
    controller.abort(new Error('TIMEOUT'));
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;

  try {
    traceLazy('request.start', {
      routine,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      mode: options.mode ?? 'silent',
    });

    const directTransport = await withAbort(resolveDirectTransport(), signal);
    if (directTransport) {
      traceLazy('request.direct.start', {
        routine,
      });
      const result = await withAbort(
        directTransport.execBff<TData>(createRequest(routine, params, 'test'), {
          ...options,
          signal,
        }),
        signal,
      );
      traceLazy('request.direct.response', {
        routine,
      });
      return unwrapDirectResult(result);
    }

    const response = await fetch('/execBff', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createRequest(routine, params, 'http')),
      signal,
    });

    traceLazy('request.response', {
      routine,
    });
    return response.json();
  } catch (error) {
    if (signal.aborted) {
      traceLazy('request.timeout', {
        routine,
      });
      return {
        ok: false,
        data: null,
        error: {
          code: 'TIMEOUT',
          message: 'O servidor demorou demais para responder.',
        },
      };
    }

    traceLazy('request.networkError', {
      routine,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Servidor indisponivel ou sem conexao.',
        details: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    globalThis.clearTimeout(cleanupTimeout);
  }
}
