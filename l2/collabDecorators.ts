/// <mls fileReference="_102029_/l2/collabDecorators.ts" enhancement="_102027_/l2/enhancementLit"/>

import { PropertyDeclaration } from 'lit';
import { property } from 'lit/decorators.js';
import { getState, setState } from '/_102029_/l2/collabState.js';
  
/**
 * Custom decorator to bind properties to multiple data sources dynamically.
 * @param options - Property options, including type and default value.
 * Accepts variations, e.g., label="Hello {{user.name}}" label-pt="Olá {{user.name}}".
 * Do not use this for changing data sources dynamically (e.g., input values); 
 * use `propertyDataSource` instead.
 * This decorator will read state values but does not persist changes to the state.
 */
export function propertyCompositeDataSource(options?: PropertyDeclaration) {

  return (proto: any, propName: PropertyKey): any => {
    // Define a Lit property with provided options.
    property(options)(proto, propName);
    const attributeName = options?.attribute && typeof options.attribute === 'string' ? String(options.attribute) : String(propName);

    Object.defineProperty(proto, propName, {
      get() {

        // Check if attribute contains template literals
        const attributeValue = getAttributeValueWithVariation.call(this, attributeName);
        if (attributeValue && attributeValue.includes('{{')) {
          return parseCompositeData.call(this, attributeValue, attributeName, options, '', false);
        }

        if (this[`_${attributeName}`] !== undefined) return this[`_${attributeName}`];
        // Default to internal property value
        if (typeof this[`_${attributeName}`] === 'object' || Array.isArray(this[`_${attributeName}`])) return this[`_${attributeName}`];
        return attributeValue;

      },
      set(value: any) {
        if (typeof value === 'string' && value.includes('{{')) {
          // Handle template literals for dynamic data binding
          this[`_${attributeName}`] = parseCompositeData.call(this, value, attributeName, options, '', true);
        } else {
          // Handle static values
          this[`_${attributeName}`] = value;
        }
        this.requestUpdate();
      }
    });

    // Method to parse composite data from template literals
    const parseCompositeData = function (this: HTMLElement, templateStr: string, attributeName: string, options: PropertyDeclaration | undefined, value: string, add: boolean): string {
      const pattern = /\{\{(.*?)\}\}/g;
      let match;
      let composedData = templateStr;

      if (add && options && options.reflect) {
        const attributeValue = getAttributeValueWithVariation.call(this, attributeName);
        if (attributeValue !== value) this.setAttribute(attributeName, value);
      }

      let notifications: string[] = [];
      while ((match = pattern.exec(templateStr))) {
        const stateKey = match[1].trim();
        if (add) {
          notifications.push(stateKey);
        }
        const resolvedValue = getState(stateKey) || '';
        composedData = composedData.replace(match[0], resolvedValue);
      }
      if (notifications.length > 0) {
        prepareForNotification.call(this, attributeName, notifications);
      }

      return composedData;
    };

  };
}

/**
 * Custom decorator to bind properties either to static data or dynamically from CollabState.
 * @param options - Property options, including type and default value.
 * Does not support variations; use `propertyCompositeDataSource` for variations.
 * For example, label="Hello {{user.name}}" label-pt="Olá {{user.name}}" (label-pt is ignored).
 * This decorator will read state values and persist changes to the state.
 */
export function propertyDataSource(options?: PropertyDeclaration) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (proto: any, propName: PropertyKey): any => {
    // Define a Lit property with provided options.

    property(options)(proto, propName);
    // const { type } = options;
    const attributeName = options?.attribute && typeof options.attribute === 'string' ? String(options.attribute) : String(propName);

    Object.defineProperty(proto, propName, {
      get() {
        // Retrieve the raw attribute value from the DOM.

        const attributeValue = this.hasAttribute(attributeName) ? this.getAttribute(attributeName) : '';

        // If the attribute uses template binding (e.g. {{ui.checked}}), resolve from state.
        if (
          typeof attributeValue === "string" &&
          attributeValue &&
          attributeValue.includes('{{') &&
          attributeValue.includes('}}')
        ) {
          const stateKey = attributeValue.replace(/[{{}}]/g, '').trim();
          const stateValue = getState(stateKey);

          // Special handling for Boolean properties bound from state.
          if (options?.type === Boolean) {
            // If state provides a boolean, return it directly.
            if (typeof stateValue === 'boolean') return stateValue;
            // If state provides a string, treat "true" or "" as true, otherwise false.
            if (typeof stateValue === 'string') return stateValue === 'true' || stateValue === '';
            // Fallback: cast any other value to boolean.
            return Boolean(stateValue);
          }

          let aux = stateValue ? stateValue.toString() : '';
          if (typeof stateValue === 'object') aux = JSON.stringify(stateValue);
          if (options?.type === String) return stateValue ? aux : stateValue;
          if (options?.type === Array && typeof stateValue === 'string') return JSON.parse(stateValue);
          return stateValue;
        }

        // Special handling for Boolean properties from static attribute.
        if (options?.type === Boolean) {
          // Special handling for Boolean properties from static attribute.
          // In standard HTML, the presence of a boolean attribute (even as checked="false") means true.
          // Here, if the attribute value is exactly "false" or the attribute is absent, it is considered false.
          // This makes <element checked="false"> behave as false, for developer convenience.


          if (!this.hasAttribute(attributeName)) {
            return this[`_${attributeName}`] !== undefined
              ? this[`_${attributeName}`]
              : undefined; 
          }

          if (attributeValue === 'false') return false;
          if (attributeValue === 'true' || attributeValue === '') return true;
          if (typeof attributeValue === 'boolean') return attributeValue;
          return Boolean(attributeValue);
          
        }

        // Return internal property value if set (via JS).
        if (this[`_${attributeName}`] !== undefined) return this[`_${attributeName}`];

        // Fallback: return raw attribute value.
        return attributeValue;
      },
      set(value: any) {
        const oldValue = this[`_${attributeName}`];

        if (options?.type === Number && typeof value === 'number' && isNaN(value)) {
          // ignore , lit sent ex "{{users.name}}" after requestUpdate
          const attributeValue = this.hasAttribute(attributeName) ? this.getAttribute(attributeName) : '';

          if (typeof attributeValue === 'string' && attributeValue.startsWith('{{') && attributeValue.endsWith('}}')) {
            // initialization ex selectedvalue="{{globalState.users[0].sex}}"
            // dynamic data from json
            if (options?.reflect) {
              const attributeValueR = this.hasAttribute(attributeName) ? this.getAttribute(attributeName) : '';
              if (attributeValueR !== value) this.setAttribute(attributeName, value);
            }
            const stateKey = attributeValue.replace(/[{{}}]/g, '').trim();
            prepareForNotification.call(this, attributeName, [stateKey]);
            this[`_${attributeName}`] = value;             // Store new value locally
            setState(stateKey, value);              // Update global state
          } else {
            this[`_${attributeName}`] = value;
          }
          this.requestUpdate(String(propName), oldValue);
          return;
        }

        if (options?.type === Boolean && typeof value === 'boolean') {
          // ignore , lit sent ex "{{users.name}}" after requestUpdate
          const attributeValue = this.hasAttribute(attributeName) ? this.getAttribute(attributeName) : '';

          if (typeof attributeValue === 'string' && attributeValue.startsWith('{{') && attributeValue.endsWith('}}')) {
            // initialization ex selectedvalue="{{globalState.users[0].sex}}"
            // dynamic data from json
            if (options?.reflect) {
              const attributeValueR = this.hasAttribute(attributeName) ? this.getAttribute(attributeName) : '';
              if (attributeValueR !== value) this.setAttribute(attributeName, value);
            }
            const stateKey = attributeValue.replace(/[{{}}]/g, '').trim();
            prepareForNotification.call(this, attributeName, [stateKey]);
            this[`_${attributeName}`] = value;
            setState(stateKey, value);
          } else {
            this[`_${attributeName}`] = value;
          }
          this.requestUpdate(String(propName), oldValue);
          return;
        }

        if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
          // initialization ex selectedvalue="{{globalState.users[0].sex}}"
          // dynamic data from json
          if (options?.reflect) {
            const attributeValue = this.hasAttribute(attributeName) ? this.getAttribute(attributeName) : '';
            if (attributeValue !== value) this.setAttribute(attributeName, value);
          }
          const stateKey = value.replace(/[{{}}]/g, '').trim();
          prepareForNotification.call(this, attributeName, [stateKey]);
          this[`_${attributeName}`] = getState(stateKey);
        } else if (options?.type === Object && (typeof value === 'string' && ((value.startsWith('[') || value.startsWith('{')) && (value.endsWith(']') || value.endsWith('}'))))) {
          // initialization ex options="[{ key: 'm', value: 'male' }, { key: 'f', value: 'female' }, { key: 'o', value: 'other' }]"
          // Parse JSON string for static data
          this[`_${attributeName}`] = JSON.parse(value);
        } else {
          // updates ex selectedValue = 'm';
          // Update both internal property value and globalState if necessary and notify state changes 
          const attributeValue = this.hasAttribute(attributeName) ? this.getAttribute(attributeName) : '';
          if (typeof attributeValue === "string" && attributeValue.includes('{{') && attributeValue.includes('}}')) {

            const dynamicKey = attributeValue.replace(/[{{}}]/g, '').trim();

            this[`_${attributeName}`] = value;
            setState(dynamicKey, value);

          }
          else this[`_${attributeName}`] = value;
        }
        this.requestUpdate(String(propName), oldValue);
      }
    });

  };
}

function prepareForNotification(this: any, attributeName: string, path: string[]) {
  // update state keys on IcaLitElement
  if (typeof this.updateStateKeys !== 'function') return;
  this.updateStateKeys(attributeName, path);
}

/**
 * Retrieves an attribute value based on the variation.
 * 
 * @param key - The key of the attribute.
 * @param proto - The prototype object containing the attribute.
 * @returns The value of the attribute, considering the variation, or the default value if no variation is found.
 */
function getAttributeValueWithVariation(this: any, key: string): string {

  const htmlLang = document.documentElement.lang;
  const lang = htmlLang.toLowerCase();

  const actualVariation = this.globalVariation || 0;
  const languageByVariation = lang;
  const languageByVariationSimilar = languageByVariation.split('-')[0];

  const defaultValue = this.getAttribute(key);
  if (actualVariation === 0) return defaultValue;
  const keyVariation = `${key}-${languageByVariation}`;
  const keyVariationSimilar = `${key}-${languageByVariationSimilar}`;
  let variationValue = this.getAttribute(keyVariation);
  if (!variationValue) variationValue = this.getAttribute(keyVariationSimilar);
  return variationValue || defaultValue;
}

export interface OptionItem {
  key: string;
  value: string;
}
