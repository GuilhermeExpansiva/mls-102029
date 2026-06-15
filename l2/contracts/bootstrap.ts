/// <mls fileReference="_102029_/l2/contracts/bootstrap.ts" enhancement="_blank" />

export type AuraShellMode = 'spa' | 'pwa';

export type AuraDeviceKind = 'desktop' | 'mobile';

export type AuraAsideMode = 'inline' | 'drawer' | 'fullscreen';

export type Platform = "web" | "mobile";

export type ISkillConfig = "layer1" | "layer2" | "layer3" | "layer4" | "contract" | "architecture" | "definition";

export type PathConfig = {
  sharedPath: string
  sharedSkill: string
}

export type ISkill = Partial<Record<ISkillConfig, {skillPath:string[]}>>

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

export type AuraRegionName = 'header' | 'aside' | 'content';

export interface AuraLayoutConfig {
  regions: {
    desktop: AuraRegionVisibility;
    mobile: AuraRegionVisibility;
  };
  asideMode: {
    desktop: AuraAsideMode;
    mobile: AuraAsideMode;
  };
  asideSize?: {
    desktopWidthPx?: number;
    drawerWidthPx?: number;
  };
}

export interface AuraRegionRendererConfig {
  entrypoint: string;
  tag: string;
}

export interface AuraDynamicRegionConfig {
  renderer: AuraRegionRendererConfig;
  widthPx?: number;
  source?: string;
  switchWithoutRouteReload?: boolean;
  props?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  component?: string;
  appsMenuSource?: string;
  [key: string]: unknown;
}

export interface AuraShellRegionProfiles {
  activeProfile: string;
  switchWithoutRouteReload?: boolean;
  profiles: Record<string, AuraDynamicRegionConfig>;
}

export interface AuraClientShellConfig {
  mode: AuraShellMode;
  activeProfile?: string;
  runtimeControls?: Record<string, string>;
  regions: {
    header?: AuraShellRegionProfiles;
    aside?: AuraShellRegionProfiles;
  };
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
  clientShell?: AuraClientShellConfig;
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
      setHeaderRenderer: (renderer: AuraRegionRendererConfig, props?: Record<string, unknown>) => Promise<void>;
      setAsideRenderer: (renderer: AuraRegionRendererConfig, props?: Record<string, unknown>) => Promise<void>;
      setShellProfile: (profileName: string) => Promise<void>;
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
