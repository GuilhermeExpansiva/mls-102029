/// <mls fileReference="_102029_/l2/interactionRuntime.ts" enhancement="_blank" />
import type {
  AuraBlockingErrorState,
  AuraInteractionMode,
  AuraInteractionState,
  AuraNormalizedError,
} from '/_102029_/l2/contracts/bootstrap.js';

const DIMMED_DELAY_MS = 600;
const DEFAULT_TIMEOUT_MS = 10000;

function traceLazy(event: string, details?: Record<string, unknown>) {
  if (!globalThis.window || !window.isTraceLazy) {
    return;
  }
  console.log('[traceLazy][interaction]', event, details ?? {});
}

type InteractionListener = (state: AuraInteractionState) => void;

interface BlockingActionOptions {
  mode?: AuraInteractionMode;
  timeoutMs?: number;
  clearContentWhileBusy?: boolean;
  busyLabel?: string;
  retry?: () => Promise<unknown> | unknown;
  errorTitle?: string;
}

interface PendingNavigationLoad {
  consumed: boolean;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
}

const listeners = new Set<InteractionListener>();
let currentState: AuraInteractionState = {
  busy: false,
  busyPhase: 'idle',
  clearContentWhileBusy: false,
};
let busyPromise: Promise<unknown> | null = null;
let dimmedTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let timeoutTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let pendingNavigationLoad: PendingNavigationLoad | null = null;
let activeRetry: (() => Promise<unknown> | unknown) | undefined;

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function emitState() {
  if (globalThis.window) {
    window.collabAuraInteractionState = currentState;
  }
  listeners.forEach((listener) => listener(currentState));
}

function setState(nextState: AuraInteractionState) {
  currentState = nextState;
  emitState();
}

function clearTimers() {
  if (dimmedTimer !== null) {
    globalThis.clearTimeout(dimmedTimer);
    dimmedTimer = null;
  }
  if (timeoutTimer !== null) {
    globalThis.clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

function publishBlockingError(error: AuraNormalizedError, options: BlockingActionOptions) {
  const blockingError: AuraBlockingErrorState = {
    title: options.errorTitle ?? 'Nao foi possivel carregar esta pagina',
    error,
    canRetry: typeof options.retry === 'function',
  };

  setState({
    busy: false,
    busyPhase: 'idle',
    busyLabel: undefined,
    clearContentWhileBusy: false,
    blockingError,
  });
}

export function getInteractionState() {
  return currentState;
}

export function subscribeToInteractionState(listener: InteractionListener) {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

export function clearBlockingError() {
  if (!currentState.blockingError) {
    return;
  }
  setState({
    ...currentState,
    blockingError: undefined,
  });
}

export function normalizeInteractionError(error: unknown): AuraNormalizedError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const candidate = error as { code: unknown; message: unknown; details?: unknown };
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return {
        code: candidate.code,
        message: candidate.message,
        details: candidate.details,
      };
    }
  }

  if (error instanceof Error) {
    return {
      code: 'UNEXPECTED_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'UNEXPECTED_ERROR',
    message: String(error),
  };
}

export async function retryBlockingError() {
  const retry = (currentState.blockingError?.canRetry ? activeRetry : undefined);
  if (!retry) {
    return;
  }
  clearBlockingError();
  await retry();
}

export function beginExpectedNavigationLoad(signal?: AbortSignal) {
  const deferred = createDeferred();
  pendingNavigationLoad = {
    consumed: false,
    promise: deferred.promise,
    resolve: deferred.resolve,
    reject: deferred.reject,
    signal,
  };
  traceLazy('beginExpectedNavigationLoad', {
    hasSignal: Boolean(signal),
  });
  return deferred.promise;
}

export function consumeExpectedNavigationLoad() {
  if (!pendingNavigationLoad || pendingNavigationLoad.consumed) {
    traceLazy('consumeExpectedNavigationLoad.miss');
    return null;
  }
  pendingNavigationLoad.consumed = true;
  traceLazy('consumeExpectedNavigationLoad.hit', {
    hasSignal: Boolean(pendingNavigationLoad.signal),
  });
  return pendingNavigationLoad;
}

export function bindExpectedNavigationLoad(
  pending: PendingNavigationLoad | null,
  promise: Promise<unknown>,
) {
  if (!pending) {
    return;
  }

  traceLazy('bindExpectedNavigationLoad', {
    hasSignal: Boolean(pending.signal),
  });

  promise.then(
    () => pending.resolve(),
    (error) => pending.reject(error),
  ).finally(() => {
    if (pendingNavigationLoad === pending) {
      pendingNavigationLoad = null;
    }
  });
}

export async function runBlockingUiAction<T>(
  action: (signal: AbortSignal) => Promise<T>,
  options: BlockingActionOptions = {},
): Promise<T | undefined> {
  const mode = options.mode ?? 'blocking';
  if (mode === 'silent') {
    const controller = new AbortController();
    traceLazy('runBlockingUiAction.silent');
    return action(controller.signal);
  }

  if (busyPromise) {
    traceLazy('runBlockingUiAction.reuseBusyPromise');
    return busyPromise as Promise<T | undefined>;
  }

  clearBlockingError();
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  setState({
    busy: true,
    busyPhase: 'subtle',
    busyLabel: options.busyLabel ?? 'Processando...',
    clearContentWhileBusy: options.clearContentWhileBusy ?? false,
    blockingError: undefined,
  });
  traceLazy('runBlockingUiAction.start', {
    clearContentWhileBusy: options.clearContentWhileBusy ?? false,
    timeoutMs,
  });

  dimmedTimer = globalThis.setTimeout(() => {
    traceLazy('runBlockingUiAction.dimmed');
    setState({
      ...currentState,
      busy: true,
      busyPhase: 'dimmed',
    });
  }, DIMMED_DELAY_MS);

  busyPromise = new Promise<T | undefined>((resolve, reject) => {
    timeoutTimer = globalThis.setTimeout(() => {
      traceLazy('runBlockingUiAction.timeout');
      controller.abort(new Error('TIMEOUT'));
    }, timeoutMs);

    const aborted = new Promise<never>((_, rejectAbort) => {
      controller.signal.addEventListener('abort', () => {
        rejectAbort(controller.signal.reason ?? new Error('TIMEOUT'));
      }, { once: true });
    });

    Promise.race([
      Promise.resolve().then(() => action(controller.signal)),
      aborted,
    ])
      .then((result) => {
        clearTimers();
        busyPromise = null;
        activeRetry = undefined;
        traceLazy('runBlockingUiAction.success');
        setState({
          busy: false,
          busyPhase: 'idle',
          busyLabel: undefined,
          clearContentWhileBusy: false,
          blockingError: undefined,
        });
        resolve(result);
      })
      .catch((error) => {
        clearTimers();
        busyPromise = null;
        activeRetry = options.retry;
        const normalized = controller.signal.aborted
          ? {
              code: 'TIMEOUT',
              message: 'O servidor demorou demais para responder.',
            }
          : normalizeInteractionError(error);
        traceLazy('runBlockingUiAction.error', {
          code: normalized.code,
          message: normalized.message,
        });
        publishBlockingError(normalized, options);
        reject(normalized);
      });
  });

  return busyPromise as Promise<T | undefined>;
}
