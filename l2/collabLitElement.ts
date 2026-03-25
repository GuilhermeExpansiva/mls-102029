/// <mls fileReference="_102029_/l2/collabLitElement.ts" enhancement="_102027_/l2/enhancementLit"/>

import { LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { globalState } from '/_102029_/l2/collabState.js';

/**
 * Class extending LitElement with CollabState functionality.
 */
export class CollabLitElement extends LitElement {

  @property({ type: Number }) globalVariation: number = globalState.globalVariation || 0;

  createRenderRoot() {
    
    return this;

  }


  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('globalVariation') && changedProperties.get('globalVariation') !== undefined) {
      this.requestUpdate();
    }
  }

  getMessageKey(messages: any): string {
    return getMessageKey(messages);
  }

  loadStyle(css: string) {
    if (!css) return;
    const tagName = this.tagName.toLowerCase();
    const alreadyAdded = document.head.querySelector(`style#${tagName}`);
    if (alreadyAdded) {
      alreadyAdded.textContent = css;
      return;
    }
    const style = document.createElement('style');
    style.id = tagName;
    style.textContent = css;
    document.head.appendChild(style);
  }

}

export function getMessageKey(messages: any): string {
  const keys = Object.keys(messages);
  if (!keys || keys.length < 1) throw new Error('Error Message not valid for international');
  const firstKey = keys[0];
  const lang = (document.documentElement.lang || '').toLowerCase();
  if (!lang) return firstKey;
  if (messages.hasOwnProperty(lang)) return lang;
  const similarLang = keys.find((key: string) => lang.substring(0, 2) === key);
  if (similarLang) return similarLang;
  return firstKey;
}

export interface IScenaryDetails {
  description: string,
  html: HTMLElement
}
