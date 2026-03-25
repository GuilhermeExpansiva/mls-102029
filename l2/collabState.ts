/// <mls fileReference="_102029_/l2/collabState.ts" enhancement="_blank"/>


/**
 * Returns the value for a given state key.
 * @param key State key in dot notation.
 * @returns The value stored at the specified key, or undefined if not set.
 */
export function getState(key: string): any {
  return globalState.globalStateManagment.getState(key);
}

/**
 * Updates the value for a given state key.
 * @param key State key in dot notation.
 * @param value Value to be stored.
 * @param systemChange Optional. If true, marks as a system-initiated change.
 */
export function setState(key: string, value: any, systemChange?: boolean): void {
  globalState.globalStateManagment.setState(key, value, systemChange);
}

/**
 * Subscribes a component to one or more state keys.
 * @param keyOrKeys - The state key or keys. Example: 'name/0;ui.name'.  
 * Use a key starting with '*' (e.g. '*myKey;ui.xxx') to ensure only one active subscription with that key.
 * @param component - The subscribing component or callback function.
 */
export function subscribe(keyOrKeys: string | string[], component: Object): void {
  return globalState.globalStateManagment.subscribe(keyOrKeys, component);
}

/**
 * Unsubscribe a component from a state key or keys.
 * @param keyOrKeys - The state key or keys.
 * @param component - The unsubscribing component.
 */
 export function unsubscribe(keyOrKeys: string | string[], component: Object | "*"): void {
  return globalState.globalStateManagment.unsubscribe(keyOrKeys, component);
 }

/**
 * Notify subscribed components about a state change.
 * @param key - The state key that changed.
 */
export function notify(key: string): void {
  return globalState.globalStateManagment.notify(key);
}

/**
 * Initializes a nested property in the global state object if it doesn't already exist.
 * If the property exists, it retains its current value without being overwritten.
 *
 * @param {string} path - The dot-separated path specifying the property to initialize (e.g., "globalState.users").
 * @param {*} value - The value to set if the property at the given path does not exist.
 */
export function initState(path: string, value: string | Object | Array<unknown>) {
  const keys = path.split('.');
  if (!globalState._ica) {
    globalState._ica = {}
  }
  let current = globalState._ica;

  keys.forEach((key, index) => {
    // changed
    if (!current[key]) {
      // Create an object or set the value if it doesn't exist
      current[key] = index === keys.length - 1 ? value : {};
    } else if (index === keys.length - 1 && typeof current[key] === 'object' && typeof value === 'object') {
      // Merge objects if both existing and new values are objects
      if (Array.isArray(current[key]) && Array.isArray(value)) {
        current[key] = [...value ];
      } else {
        current[key] = { ...value };
      }
      
    }
    current = current[key];
  });
}


const isTrace = false;

// Declare a global state structure
export interface GlobalState {
  [key: string]: any;
}

// Extend the Window interface
/*declare global {
  export interface Window {
    globalState: GlobalState;
    globalStateManagment: IcaState;
    globalVariation: number;
  }
}*/


export const globalState: {
  _ica: GlobalState;
  globalStateManagment: CollabState;
  globalVariation: number;
} = {} as any;

function getCollabWindow(): any {
  if (window.parent && window.parent !== window && (window.parent as any).globalStateManagment) {
    return window.parent;
  }
  return window;
}

(window as any).getCollabWindow = getCollabWindow;

Object.defineProperty(globalState, '_ica', {
  get: function () {
    return getCollabWindow()._ica;
  },
  set: function (v: GlobalState) {
    getCollabWindow()._ica = v;
  }
});

Object.defineProperty(globalState, 'globalStateManagment', {
  get: function () {
    return getCollabWindow().globalStateManagment;
  },
  set: function (v: CollabState) {
    getCollabWindow().globalStateManagment = v;
  }
});

Object.defineProperty(globalState, 'globalVariation', {
  get: function () {
    return getCollabWindow().globalVariation;
  },
  set: function (v: number) {
    getCollabWindow().globalVariation = v;
  }
});

/**
 * Retrieves a nested property value from an object using a dot-separated path string.
 * Supports both nested object and array access with syntax like "a.b[3].c".
 *
 * Example usage:
 *   const obj = {
 *     products: [
 *       { name: "Apple" },
 *       { name: "Banana" },
 *     ],
 *     user: { name: "Alice" }
 *   };
 *
 *   getPathValue(obj, "user.name");         // returns "Alice"
 *   getPathValue(obj, "products[1].name");  // returns "Banana"
 *   getPathValue(obj, "products[2].name");  // returns undefined
 *   getPathValue(obj, "foo.bar");           // returns undefined
 *
 * @param {Object} obj - The root object to query.
 * @param {string} path - The dot-separated path string (supports array indices with brackets).
 * @returns {*} - The value found at the given path, or undefined if not found.
 */
function getPathValue(obj: { [key: string]: any }, path: string): any {
  return (path || '').split('.').reduce((acc, part) => {
    if (acc == null) return undefined;

    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const prop = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      return acc[prop]?.[index];
    }
    return acc[part];
  }, obj);
}

/**
 * Sets a nested property value in an object using a dot-separated path string.
 * Supports creation of intermediate objects and arrays as needed.
 * Array indices can be specified using square brackets, e.g., "a.b[3].c".
 *
 * Example usage:
 *   const obj = {};
 *   setPathValue(obj, "user.addresses[0].city", "São Paulo");
 *   // obj is now: { user: { addresses: [ { city: "São Paulo" } ] } }
 *
 *   setPathValue(obj, "produtos[1].nome", "Banana");
 *   // obj.produtos[1] is now: { nome: "Banana" }
 *
 *   setPathValue(obj, "config.theme", "dark");
 *   // obj.config.theme === "dark"
 *
 * @param {Object} obj - The root object to modify.
 * @param {string} path - The dot-separated path string (supports array indices with brackets).
 * @param {*} value - The value to set at the given path.
 */
function setPathValue(obj: { [key: string]: any }, path: string, value: any): void {
  const parts = (path || '').split('.');
  const last = parts.pop();
  if (!last) return;

  let lastObj;

  try {
    lastObj = parts.reduce((acc, part) => {
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (match) {
        const prop = match[1];
        const index = parseInt(match[2], 10);
        acc[prop] = acc[prop] || [];
        acc[prop][index] = acc[prop][index] || {};
        return acc[prop][index];
      } else {
        acc[part] = acc[part] || {};
        return acc[part];
      }
    }, obj);
  } catch (e) {
    const isArray = parts.some(p => /^\w+\[\d+\]$/.test(p));
    initState(parts.join('.'), isArray ? [] : {});
    obj = globalState._ica; // reload after initState
    lastObj = parts.reduce((acc, part) => {
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (match) {
        const prop = match[1];
        const index = parseInt(match[2], 10);
        acc[prop] = acc[prop] || [];
        acc[prop][index] = acc[prop][index] || {};
        return acc[prop][index];
      } else {
        acc[part] = acc[part] || {};
        return acc[part];
      }
    }, obj);
  }

  const lastIsArray = /^\w+\[\d+\]$/.test(last);
  if (lastIsArray && !Array.isArray(lastObj[last])) lastObj[last] = [];
  if (!lastIsArray && typeof lastObj[last] !== 'object') lastObj[last] = {};

  lastObj[last] = value;
}

export interface CollabState {
  getState(key: string): any;
  setState(key: string, value: any, systemChange?: boolean): void;
  getHistory(): Array<{ timestamp: number; system: boolean; key: string; value: any }>;
  clearHistory(): void;
  subscribe(keyOrKeys: string | string[], component: Object): void;
  unsubscribe(keyOrKeys: string | string[], component: Object | "*"): void;
  notify(key: string): void;
}

/**
 * -----------
 * Class responsible for managing shared state.
 * -----------
 */
class CollabStateSingleton implements CollabState {
  //private stateMap: Map<string, any> = new Map(); // values of variables
  private componentMap: Map<string, Set<Object>> = new Map(); // subscribes
  private history: Array<{ timestamp: number; system: boolean; key: string; value: any }> = [];

  public getState(key: string): any {
    const value = getPathValue(globalState._ica, key);
    if (isTrace) console.info('getState key: ' + key + ' value=', value);
    return value;
  }

  public setState(key: string, value: any, systemChange?: boolean): void {
    // Default systemChange to this.inNotify if not provided
    systemChange = systemChange ?? false;
    const oldValue = getPathValue(globalState._ica, key);;
    // this.stateMap.get(key);

    if (isTrace) console.info('setState key: ' + key + ' value=', value, ", oldValue=", oldValue)
    if (oldValue === value) return;
    // this.stateMap.set(key, value);
    const notifies: string[] = [key]; // array for notifies
    if (typeof value === "object" && value !== null) {
      const n: string[] = this.getNotifies(key, value);
      for (const path of n) {
        const oldValue: any = getPathValue(globalState._ica, path);
        const newValue: any = getPathValue(value, path.replace(key + ".", ""));
        if (oldValue !== newValue) notifies.push(path);
      }
    }
    setPathValue(globalState._ica, key, value);
    this.logHistory(key, value, systemChange);
    this.notify(notifies);
  }

  /**
   * Given a base path and a newObj, finds all nested paths that match
   * registered subscriptions (componentMap) and returns them in a list.
   *
   * @param path - The base path, ex: "db.products"
   * @param newObj - The new object, ex: { "1": { name: "foo" } }
   * @returns Array of keys (paths) that have subscribers
   */
  getNotifies(path: string, newObj: any): string[] {
    const ret: string[] = [];
    const visit = (currentPath: string, value: any) => {
      if (value && typeof value === "object") {
        Object.keys(value).forEach(k => {
          const nextPath = /^\d+$/.test(k)
            ? `${currentPath}[${k}]`
            : `${currentPath}.${k}`;
          if (this.componentMap.has(nextPath)) {
            ret.push(nextPath);
          }
          visit(nextPath, value[k]);
        });
      }
    };
    visit(path, newObj);
    return ret;
  }

  /**
   * Logs the state change in history.
   * @param key - The state key that was changed.
   * @param value - The new state value.
   * @param system - Indicates whether the change was made by the system.
   */
  private logHistory(key: string, value: any, system: boolean): void {
    const entry = {
      timestamp: Date.now(),
      system,
      key,
      value
    };

    this.history.push(entry);

    // Keep only the last 10,000 entries
    if (this.history.length > 10000) {
      this.history.shift();
    }
  }

  /**
   * Retrieves the history of state changes.
   */
  public getHistory(): Array<{ timestamp: number; system: boolean; key: string; value: any }> {
    return this.history;
  }

  /**
   * clear all entries in the history
   */
  public clearHistory(): void {
    this.history = [];
  }

  public subscribe(keyOrKeys: string | string[], component: Object, id?: string): void {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    keys.forEach((key) => {
      if (!key.includes(';')) key = `;${key}`;
      if (isTrace) console.log('subscribe key(s)', keyOrKeys)

    const isExclusive = key.startsWith('*');
    if (isExclusive) {
      this.componentMap.delete(key); // clear olds subscribes
    }

      if (!this.componentMap.has(key)) {
        this.componentMap.set(key, new Set());
      }
      this.componentMap.get(key)!.add(component);
    });
  }

  public unsubscribe(keyOrKeys: string | string[], component: Object | "*"): void {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];

    keys.forEach((key) => {
      if (!key.includes(';')) key = `;${key}`;
      if (component === "*") {
        if (isTrace) console.log('unsubscribe key', key, " all components");
        this.componentMap.set(key, new Set());
      } else {
        if (isTrace) console.log('unsubscribe key', key, this.componentMap.get(key)?.has(component))
        this.componentMap.get(key)?.delete(component);
      }
    });
  }

  private notifyQueue: string[] = [];
  private isNotifying: boolean = false;

  public notify(keys: string | string[]): void {
    if (typeof keys === "string") keys = [keys];
    for (const key of keys) {
      if (!this.notifyQueue.includes(key)) {
        this.notifyQueue.push(key);
      }
    }
    if (this.isNotifying) return;

    this.isNotifying = true;
    let nextKey: string = "";
    try {
      while (this.notifyQueue.length > 0) {
        nextKey = this.notifyQueue.shift()!;
        if (isTrace) console.log(`notify key=${nextKey}`, this.componentMap);
        Array.from(this.componentMap).find((map) => {
          const [stateKey, arr] = map;
          const path = stateKey.split(';')[1];
          if (path !== nextKey) return;
          arr.forEach((component: any) => {
            if ('handleIcaStateChange' in component) {
              component['handleIcaStateChange'](nextKey, this.getState(nextKey));
            } else if (typeof component === 'function') {
              component(nextKey, this.getState(nextKey));
            } else {
              console.error('invalid notify on key: ' + nextKey);
            }
          });
        });
      }
    } catch (e) {
      console.error("error on notify, key: " + nextKey, e);
    } finally {
      this.isNotifying = false;
    }
  }

  /**
   * Get statistics about current state keys and their subscribers.
   */
  getStateStatistics(): Map<string, number> {
    const statistics = new Map<string, number>();
    this.componentMap.forEach((value, key) => {
      statistics.set(key, value.size);
    });
    return statistics;
  }
}

export function getCollabStateInstance(): CollabState {
  const win = getCollabWindow();
  if (!win.collabState) {
    win.collabState = new CollabStateSingleton();
  }
  return win.collabState;
}

if (!globalState.globalStateManagment) globalState.globalStateManagment = getCollabStateInstance();

if (!globalState._ica) globalState._ica = {};
