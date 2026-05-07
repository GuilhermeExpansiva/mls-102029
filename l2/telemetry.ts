/// <mls fileReference="_102029_/l2/telemetry.ts" enhancement="_blank" />

export interface ClientTelemetryEvent {
  eventType: string;
  label: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
  recordedAt: string;
}

const IDB_DB_NAME = 'collab-telemetry';
const IDB_STORE = 'events';
const IDB_VERSION = 1;
const QUEUE_CAP = 50;
const BEACON_URL = '/execBff';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbReadAll(): Promise<ClientTelemetryEvent[]> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve((req.result as ClientTelemetryEvent[]) ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function idbClear(): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}

async function idbAdd(event: ClientTelemetryEvent): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).add(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}

class TelemetryQueue {
  private queue: ClientTelemetryEvent[] = [];
  private userId = 'anonymous';

  constructor() {
    if (typeof globalThis.window === 'undefined') {
      return;
    }
    // Recover events from a previous crash on next page load
    void idbReadAll().then((recovered) => {
      if (recovered.length > 0) {
        for (const ev of recovered) {
          this.queue.push(ev);
        }
        if (this.queue.length > QUEUE_CAP) {
          this.queue.splice(0, this.queue.length - QUEUE_CAP);
        }
        void idbClear();
      }
    });

    window.addEventListener('error', (ev) => {
      this.push({
        eventType: 'js_error',
        label: ev.message ?? 'Unknown error',
        metadata: {
          filename: ev.filename,
          lineno: ev.lineno,
          colno: ev.colno,
        },
        recordedAt: new Date().toISOString(),
      });
      this.sendBeacon();
    });

    window.addEventListener('unhandledrejection', (ev) => {
      const msg = ev.reason instanceof Error
        ? ev.reason.message
        : String(ev.reason ?? 'Unhandled rejection');
      this.push({
        eventType: 'unhandled_rejection',
        label: msg,
        recordedAt: new Date().toISOString(),
      });
      this.sendBeacon();
    });

    window.addEventListener('beforeunload', () => {
      if (this.queue.length > 0) {
        this.sendBeacon();
      }
    });
  }

  setUserId(id: string): void {
    this.userId = id;
  }

  push(event: ClientTelemetryEvent): void {
    const stamped: ClientTelemetryEvent = {
      ...event,
      recordedAt: event.recordedAt ?? new Date().toISOString(),
    };
    this.queue.push(stamped);
    if (this.queue.length > QUEUE_CAP) {
      this.queue.shift();
    }
    void idbAdd(stamped);
  }

  flush(): ClientTelemetryEvent[] {
    const events = this.queue.splice(0, this.queue.length);
    void idbClear();
    return events;
  }

  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.push({
        eventType: 'measure',
        label,
        durationMs: Date.now() - start,
        recordedAt: new Date().toISOString(),
      });
    }
  }

  private sendBeacon(): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      return;
    }
    const events = this.flush();
    if (events.length === 0) {
      return;
    }
    const body = JSON.stringify({
      routine: 'monitor.telemetry.flush',
      params: {},
      meta: {
        source: 'http',
        userId: this.userId,
        telemetry: events,
      },
    });
    navigator.sendBeacon(BEACON_URL, new Blob([body], { type: 'application/json' }));
  }
}

export const telemetryQueue = new TelemetryQueue();
