/// <mls fileReference="_102029_/l2/bffClient.ts" enhancement="_blank" />
import type { AuraInteractionMode, AuraNormalizedError } from '/_102029_/l2/contracts/bootstrap.js';
import { telemetryQueue, type ClientTelemetryEvent } from '/_102029_/l2/telemetry.js';

export type { ClientTelemetryEvent };

function traceLazy(event: string, details?: Record<string, unknown>) {
  if (!globalThis.window || !window.isTraceLazy) {
    return;
  }
  console.log('[traceLazy][bff-client]', event, details ?? {});
}

export interface BffClientOptions {
  mode?: AuraInteractionMode;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BffClientResponse<TData = unknown> {
  ok: boolean;
  data: TData | null;
  error: AuraNormalizedError | null;
  telemetryReceived?: number;
}

let _userId = 'anonymous';

export function setUserId(id: string): void {
  _userId = id;
  telemetryQueue.setUserId(id);
}

export function pushTelemetry(event: ClientTelemetryEvent): void {
  telemetryQueue.push(event);
}

const DEFAULT_TIMEOUT_MS = 10000;

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
    const response = await fetch('/execBff', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        routine,
        params,
        meta: {
          source: 'http',
          userId: _userId,
          telemetry: telemetryQueue.flush(),
        },
      }),
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
