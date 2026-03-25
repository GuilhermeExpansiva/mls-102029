/// <mls fileReference="_102029_/l2/stateLitElement.ts" enhancement="_blank"/>

import { PropertyValueMap } from 'lit';
import { CollabLitElement } from '/_102029_/l2/collabLitElement.js';
import { getState, setState, subscribe, unsubscribe, notify } from '/_102029_/l2/collabState.js';
const isTrace = false;

/**
 * Base class for all components that need to interact with the shared state.
 */
export abstract class StateLitElement extends CollabLitElement {

  // Controls the states associated with this object.
  // Once disconnected from the DOM, this web component will no longer receive notifications.
  // Paths can be modified dynamically during the web component's lifecycle. For example in attribute html:
  // name='{{globalStore.users.users[0].name}}'
  // ...
  // name='{{globalStore.users.users[1].name}}'
  stateKeys: Map<string, boolean> = new Map<string, boolean>();

  updateStateKeys(attributeName: string, paths: string[]): void {
    // example: 
    // attributeName = "label"
    // paths = ["user.name", "user.age"]
    // example of use in html: label="User {{user.name}} is {{user.age}} users old"
    if (!attributeName || !paths || paths.length === 0) {
      console.warn('Invalid state key update attempt', { attributeName, paths });
      return;
    }

    for (const key of this.stateKeys.keys()) {
      if (key.startsWith(`${attributeName}/`)) {
        this.stateKeys.delete(key);
        unsubscribe([key], this);
      }
    }

    paths.forEach((path, index) => {
      const newItem = `${attributeName}/${index};${path}`;
      if (!this.stateKeys.has(newItem)) {
        this.stateKeys.set(newItem, false);
        this.subscribeToState(newItem);
      }
    });
  }

  private subscribeToState(stateKey: string): void {
    if (!this.stateKeys.get(stateKey)) {
      subscribe([stateKey], this);
      this.stateKeys.set(stateKey, true);
    }
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    (this as any)._loadStartTime = performance.now();
    super.connectedCallback();
    if (isTrace) {
      console.info(`connectedCallback, subscribe fields: ${Array.from(this.stateKeys.keys())}`);
    }

    this.stateKeys.forEach((isSubscribed, stateKey) => {
      if (!isSubscribed) {
        this.subscribeToState(stateKey);
      }
    });
    if (!(window as any).collabPluginMonitor) {
      this.connectMonitoring();
    }
    const tagName = this.tagName.toLowerCase();
    (window as any).collabPluginMonitor.reportStart(tagName, (this as any)._loadStartTime);

  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stateKeys.forEach((isSubscribed, stateKey) => {
      if (isSubscribed) unsubscribe([stateKey], this);
      this.stateKeys.set(stateKey, false);
    });
  }

  firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
    super.firstUpdated(_changedProperties);
    this.stateKeys.forEach((_isSubscribed, stateKey) => {
      const [, path] = stateKey.split(';');
      notify(path);
    });

    if (!(window as any).collabPluginMonitor) {
      this.connectMonitoring();
    }
    const duration = performance.now() - ((this as any)._loadStartTime ?? 0);
    const tagName = this.tagName.toLowerCase();
    (window as any).collabPluginMonitor.reportDone(tagName, duration);

  }

  updated(_changedProps: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
    super.updated(_changedProps);

    const start = performance.now();
    requestAnimationFrame(() => {
      const tagName = this.tagName.toLowerCase();
      const renderTime = performance.now() - start;
      (window as any).collabPluginMonitor?.reportUpdate?.(tagName, renderTime);
    });
  }

  /**
   * Handle state changes from IcaState.
   * @param key - The state key that changed, ex: 'users[0].name'
   * @param value - The new value of the state.
   */
  handleIcaStateChange(key: string, value: any): void {
    const isEqual = (a: any, b: any) => a === b || (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));
    const ob1: { [key: string]: any } = this;

    this.stateKeys.forEach((_isSubscribed, stateKey) => {
      let [propName, path] = stateKey.split(';');
      propName = propName.split('/')[0]; // ex: name/0 , name/1 for composite dynamic keys
      if (path !== key || !ob1.hasAttribute(propName)) return;
      const propValue: any = ob1[`_${propName}`];
      if (!isEqual(value, propValue)) {
        ob1[`_${propName}`] = value;
        this.requestUpdate();
      }
    });
  }

  connectMonitoring(): void {
    if ((window as any).collabPluginMonitor) return;

    interface ICollabMonitor {
      name: string;
      count: number;
      totalTime: number;
      updateCount: number;
      updateTime: number;
    }

    const monitor = {
      records: {} as Record<string, ICollabMonitor>,

      reportStart(name: string, _startTime: number) {
      },

      reportDone(name: string, duration: number) {
        const rec = this.getRec(name);
        rec.count++;
        rec.totalTime += duration;
        monitor.records[name] = rec;
      },

      reportUpdate(name: string, duration: number) {
        const rec = this.getRec(name);
        rec.updateCount++;
        rec.updateTime += duration;
        this.records[name] = rec;
      },

      getRec(name: string): ICollabMonitor {
        return this.records[name] || {
          name,
          count: 0,
          totalTime: 0,
          updateCount: 0,
          updateTime: 0
        };
      },

      sts() {
        return Object.values(this.records).map((r) => ({
          name: r.name,
          count: r.count,
          totalTime: parseFloat(r.totalTime.toFixed(2)),
          avgTime: parseFloat((r.totalTime / r.count).toFixed(2)),
          updateCount: r.updateCount ?? 0,
          updateTime: parseFloat((r.updateTime ?? 0).toFixed(2)),
          avgUpdateTime: r.updateCount ? parseFloat((r.updateTime / r.updateCount).toFixed(2)) : 0
        }));
      }
    };

    (window as any).collabPluginMonitor = monitor;
  }
}