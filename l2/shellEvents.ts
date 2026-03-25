/// <mls fileReference="_102029_/l2/shellEvents.ts" enhancement="_blank" />
export const AURA_TOGGLE_ASIDE_EVENT = 'collab-aura:toggle-aside';
export const AURA_OPEN_ASIDE_EVENT = 'collab-aura:open-aside';
export const AURA_CLOSE_ASIDE_EVENT = 'collab-aura:close-aside';

function dispatchAuraShellEvent(eventName: string) {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function toggleAuraAside() {
  if (window.collabAuraShellControls) {
    window.collabAuraShellControls.toggleAside();
    return;
  }
  dispatchAuraShellEvent(AURA_TOGGLE_ASIDE_EVENT);
}

export function openAuraAside() {
  if (window.collabAuraShellControls) {
    window.collabAuraShellControls.openAside();
    return;
  }
  dispatchAuraShellEvent(AURA_OPEN_ASIDE_EVENT);
}

export function closeAuraAside() {
  if (window.collabAuraShellControls) {
    window.collabAuraShellControls.closeAside();
    return;
  }
  dispatchAuraShellEvent(AURA_CLOSE_ASIDE_EVENT);
}
