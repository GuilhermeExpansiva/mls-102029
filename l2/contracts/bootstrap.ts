/// <mls fileReference="_102029_/l2/contracts/bootstrap.ts" enhancement="_blank" />

export type AuraShellMode = 'spa' | 'pwa';

export type AuraDeviceKind = 'desktop' | 'mobile';

export type AuraAsideMode = 'inline' | 'drawer' | 'fullscreen';

export type Platform = "web" | "mobile"

export type PathConfig = {
  sharedPath: string
  sharedSkill: string
}

export type IPaths = Partial<Record<Platform, PathConfig>>

export interface IGenomeConfig {
  device: AuraDeviceKind,
  designSystem: string,
  layout: string,
}

export interface AuraRegionVisibility {
  header: boolean;
  aside: boolean;
  content: boolean;
}

export interface AuraLayoutConfig {
  regions: {
    desktop: AuraRegionVisibility;
    mobile: AuraRegionVisibility;
  };
  asideMode: {
    desktop: AuraAsideMode;
    mobile: AuraAsideMode;
  };
}

export interface AuraRegionRendererConfig {
  entrypoint: string;
  tag: string;
}

export type AuraRouteMatchMode = 'exact' | 'prefix';

export interface AuraRouteDefinition {
  path: string;
  entrypoint: string;
  tag: string;
  title: string;
  aliases?: string[];
  loadingKey?: string;
  preload?: boolean;
  matchMode?: AuraRouteMatchMode;
}

export interface AuraModuleFrontendDefinition {
  pageTitle?: string;
  device?: AuraDeviceKind;
  navigation?: AuraNavigationItem[];
  routes: AuraRouteDefinition[];
  headerRenderer?: AuraRegionRendererConfig;
  asideRenderer?: AuraRegionRendererConfig;
}

export interface AuraNavigationItem {
  id: string;
  label: string;
  href: string;
  description?: string;
}

export interface AuraModuleShellPreferences {
  layout?: Partial<AuraLayoutConfig>;
}

export interface AuraBootConfig {
  projectId: string;
  moduleId: string;
  basePath: string;
  shellMode: AuraShellMode;
  device: AuraDeviceKind;
  routes: AuraRouteDefinition[];
  headerEntrypoint?: string;
  headerTag?: string;
  asideEntrypoint?: string;
  asideTag?: string;
  pageTitle?: string;
  navigation?: AuraNavigationItem[];
  moduleLinks?: AuraNavigationItem[];
  layout: AuraLayoutConfig;
}

export type AuraInteractionMode = 'blocking' | 'silent';
export type AuraBusyPhase = 'idle' | 'subtle' | 'dimmed';

export interface AuraNormalizedError {
  code: string;
  message: string;
  details?: unknown;
}

export interface AuraBlockingErrorState {
  title: string;
  error: AuraNormalizedError;
  canRetry: boolean;
}

export interface AuraInteractionState {
  busy: boolean;
  busyPhase: AuraBusyPhase;
  busyLabel?: string;
  clearContentWhileBusy: boolean;
  blockingError?: AuraBlockingErrorState;
}

declare global {
  interface Window {
    collabAuraShellControls?: {
      toggleAside: () => void;
      openAside: () => void;
      closeAside: () => void;
    };
  }

  interface Window {
    collabBoot?: AuraBootConfig;
    collabRouteChunkCache?: Set<string>;
    collabRouteChunkPromises?: Map<string, Promise<unknown>>;
    collabAuraInteractionState?: AuraInteractionState;
    isTraceLazy?: boolean;
  }
}
