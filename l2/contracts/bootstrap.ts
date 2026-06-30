/// <mls fileReference="_102029_/l2/contracts/bootstrap.ts" enhancement="_blank" />

export type MasterFrontendShellMode = 'spa' | 'pwa';

export type MasterFrontendDeviceKind = 'desktop' | 'mobile';

export type MasterFrontendAsideMode = 'inline' | 'drawer' | 'fullscreen';

export type Platform = "web" | "mobile";

export type ISkillConfig = "layer1" | "layer2" | "layer3" | "layer4" | "contract" | "architecture" | "definition";

export type PathConfig = {
  sharedPath: string
  sharedSkill: string
}

export type ISkill = Partial<Record<ISkillConfig, {skillPath:string[]}>>

export type IPaths = Partial<Record<Platform, PathConfig>>

export interface IGenomeConfig {
  device: MasterFrontendDeviceKind,
  designSystem: string,
  layout: string,
}

export interface MasterFrontendRegionVisibility {
  header: boolean;
  aside: boolean;
  content: boolean;
}

export type MasterFrontendRegionName = 'header' | 'aside' | 'content';

export interface MasterFrontendLayoutConfig {
  regions: {
    desktop: MasterFrontendRegionVisibility;
    mobile: MasterFrontendRegionVisibility;
  };
  asideMode: {
    desktop: MasterFrontendAsideMode;
    mobile: MasterFrontendAsideMode;
  };
  asideSize?: {
    desktopWidthPx?: number;
    drawerWidthPx?: number;
  };
}

export interface MasterFrontendRegionRendererConfig {
  entrypoint: string;
  tag: string;
}

export interface MasterFrontendDynamicRegionConfig {
  renderer: MasterFrontendRegionRendererConfig;
  widthPx?: number;
  source?: string;
  switchWithoutRouteReload?: boolean;
  props?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  component?: string;
  appsMenuSource?: string;
  [key: string]: unknown;
}

export interface MasterFrontendShellRegionProfiles {
  activeProfile: string;
  switchWithoutRouteReload?: boolean;
  profiles: Record<string, MasterFrontendDynamicRegionConfig>;
}

export interface MasterFrontendClientShellConfig {
  mode: MasterFrontendShellMode;
  activeProfile?: string;
  runtimeControls?: Record<string, string>;
  regions: {
    header?: MasterFrontendShellRegionProfiles;
    aside?: MasterFrontendShellRegionProfiles;
  };
}

export type MasterFrontendRouteMatchMode = 'exact' | 'prefix';

export interface MasterFrontendRouteDefinition {
  path: string;
  entrypoint: string;
  tag: string;
  title: string;
  aliases?: string[];
  loadingKey?: string;
  preload?: boolean;
  matchMode?: MasterFrontendRouteMatchMode;
}

export interface MasterFrontendModuleFrontendDefinition {
  pageTitle?: string;
  device?: MasterFrontendDeviceKind;
  navigation?: MasterFrontendNavigationItem[];
  routes: MasterFrontendRouteDefinition[];
  headerRenderer?: MasterFrontendRegionRendererConfig;
  asideRenderer?: MasterFrontendRegionRendererConfig;
}

export interface MasterFrontendNavigationItem {
  id: string;
  label: string;
  href: string;
  description?: string;
}

export interface MasterFrontendModuleShellPreferences {
  layout?: Partial<MasterFrontendLayoutConfig>;
}

export interface MasterFrontendBootConfig {
  projectId: string;
  moduleId: string;
  basePath: string;
  shellMode: MasterFrontendShellMode;
  device: MasterFrontendDeviceKind;
  routes: MasterFrontendRouteDefinition[];
  headerEntrypoint?: string;
  headerTag?: string;
  asideEntrypoint?: string;
  asideTag?: string;
  pageTitle?: string;
  navigation?: MasterFrontendNavigationItem[];
  moduleLinks?: MasterFrontendNavigationItem[];
  layout: MasterFrontendLayoutConfig;
  clientShell?: MasterFrontendClientShellConfig;
}

export type MasterFrontendInteractionMode = 'blocking' | 'silent';
export type MasterFrontendBusyPhase = 'idle' | 'subtle' | 'dimmed';

export interface MasterFrontendNormalizedError {
  code: string;
  message: string;
  details?: unknown;
}

export interface MasterFrontendBlockingErrorState {
  title: string;
  error: MasterFrontendNormalizedError;
  canRetry: boolean;
}

export interface MasterFrontendInteractionState {
  busy: boolean;
  busyPhase: MasterFrontendBusyPhase;
  busyLabel?: string;
  clearContentWhileBusy: boolean;
  blockingError?: MasterFrontendBlockingErrorState;
}

declare global {
  interface Window {
    collabMasterFrontendShellControls?: {
      toggleAside: () => void;
      openAside: () => void;
      closeAside: () => void;
      setHeaderRenderer: (renderer: MasterFrontendRegionRendererConfig, props?: Record<string, unknown>) => Promise<void>;
      setAsideRenderer: (renderer: MasterFrontendRegionRendererConfig, props?: Record<string, unknown>) => Promise<void>;
      setShellProfile: (profileName: string) => Promise<void>;
    };
  }

  interface Window {
    collabBoot?: MasterFrontendBootConfig;
    collabRouteChunkCache?: Set<string>;
    collabRouteChunkPromises?: Map<string, Promise<unknown>>;
    collabMasterFrontendInteractionState?: MasterFrontendInteractionState;
    isTraceLazy?: boolean;
  }
}
