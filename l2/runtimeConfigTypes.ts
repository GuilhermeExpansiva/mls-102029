/// <mls fileReference="_102029_/l2/runtimeConfigTypes.ts" enhancement="_blank" />

// Shared runtime-config contract, master-agnostic (spec: 102029 hosts common code).
// Two documents are typed here:
//   1. ProjectsConfig  — the workspace config.json composed at publish time and read
//      by the production masters (server reads it from the release cwd).
//   2. L5ProjectJson   — the client-owned l5/project.json fragment written by the
//      change agents (backend block, master signatures, customization). The publish
//      resolves the composers from `masters` and each composer contributes its part
//      of the final config.json (dependency inversion: masters never import clients).

// ── ProjectsConfig (workspace config.json) ───────────────────────────────────

export type ProjectType = 'master frontend' | 'master backend' | 'client' | 'lib';

export interface ProjectModuleFrontendEntrypoint {
  entrypoint: string;
  componentTag: string;
}

export interface ProjectFrontendPageConfig {
  pageId: string;
  route: string;
  source: string;
  definition?: string;
  componentTag: string;
  title?: string;
}

export interface ProjectModuleFrontendConfig {
  layer?: 'l2' | string;
  moduleEntrypoint?: string;
  moduleSource?: string;
  pages?: ProjectFrontendPageConfig[];
}

export interface ProjectPersistenceModuleConfig {
  moduleId: string;
  // Legacy model: a single entrypoint exporting tableDefinitions/getTableDefinitions.
  persistenceEntrypoint?: string;
  // Hexagonal model: a folder of table-definition adapters; the runtime discovers every
  // TableDefinition-shaped export inside it (no generated persistence index file).
  tableDefsDir?: string;
}

export interface ProjectRegionRendererConfig {
  entrypoint: string;
  tag: string;
  source?: string;
}

export interface ProjectDynamicRegionConfig {
  renderer: ProjectRegionRendererConfig;
  widthPx?: number;
  source?: string;
  switchWithoutRouteReload?: boolean;
  props?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  component?: string;
  appsMenuSource?: string;
  [key: string]: unknown;
}

export interface ProjectShellRegionProfiles {
  activeProfile: string;
  switchWithoutRouteReload?: boolean;
  profiles: Record<string, ProjectDynamicRegionConfig>;
}

export interface ProjectClientShellConfig {
  mode: 'spa' | 'pwa';
  activeProfile?: string;
  runtimeControls?: Record<string, string>;
  regions: {
    header?: ProjectShellRegionProfiles;
    aside?: ProjectShellRegionProfiles;
  };
}

export interface ProjectNavigationEntry {
  id: string;
  label: string;
  href: string;
  description?: string;
}

export interface ProjectModuleConfig {
  moduleId: string;
  basePath: string;
  shellMode: 'spa' | 'pwa';
  navigation?: ProjectNavigationEntry[];
  frontendEntrypoints?: {
    desktop?: ProjectModuleFrontendEntrypoint;
    mobile?: ProjectModuleFrontendEntrypoint;
  };
  frontend?: ProjectModuleFrontendConfig;
  // Legacy model: a single generated router file exporting create*Router(): Map<routeKey, BffHandler>.
  backendRouter?: string;
  // Hexagonal model: a folder of http controllers; the runtime discovers routes from each
  // controller's exported `routes: ControllerRoute[]` (no generated router file).
  backendControllers?: string;
  backend?: Record<string, unknown>;
}

export interface ProjectConfigRecord {
  root: string;
  type?: ProjectType;
  role?: string;
  modules?: ProjectModuleConfig[];
  persistenceModules?: ProjectPersistenceModuleConfig[];
}

export interface PublicationTargetConfig {
  assetBaseUrl?: string;
  serveStaticFromServer?: boolean;
  minify?: boolean;
  sourcemap?: boolean;
}

export interface PublicationConfig {
  defaultTarget: string;
  targets: Record<string, PublicationTargetConfig>;
}

export interface ProjectsConfig {
  defaultProjectId: string;
  shellTemplates: {
    spa: string;
    pwa: string;
  };
  publication: PublicationConfig;
  clientShell?: ProjectClientShellConfig;
  // One 'client' entry per workspace today; the map shape already supports several
  // clients in the future (one pm2 entry per client).
  projects: Record<string, ProjectConfigRecord>;
}

// ── MasterRuntimeManifest (master-owned mls-<runtimeProject>/masterModules.json) ──

/** System modules a production master ships with (e.g. 102034: mdm, monitor, audit).
 *  The publish composer merges this into projects[<runtimeProject>] of the composed
 *  config.json — the master stays self-describing and agnostic to clients. */
export interface MasterRuntimeManifest {
  modules?: ProjectModuleConfig[];
  persistenceModules?: ProjectPersistenceModuleConfig[];
}

// ── L5ProjectJson (client-owned l5/project.json) ─────────────────────────────

/** Signature written by a change agent: who generated this side of the project. */
export interface L5MasterSignature {
  /** Studio (dev) project that hosts the agent, e.g. 102020 / 102021. */
  masterProject: number;
  /** Agent folder inside <masterProject>/l2; the publish resolves the composer at
   *  mls-<masterProject>/l2/<agentFolder>/nodejsSaveConfigJson.ts */
  agentFolder: string;
  /** Production master referenced in the composed config.json, e.g. 102033 / 102034. */
  runtimeProject: number;
}

export interface L5Masters {
  frontend?: L5MasterSignature;
  backend?: L5MasterSignature;
}

export interface L5ModuleBackendConfig {
  backendControllers: string;
  persistence: { tableDefsDir: string };
  routeKeys: string[];
}

export interface L5Module {
  moduleName: string;
  backend?: L5ModuleBackendConfig;
}

export interface L5Dependency {
  projectId: string;
  kind?: string;
}

export interface L5Language {
  language: string;
  name?: string;
  path?: string;
}

/** Manual customization carried by the client project; composers translate these
 *  fields into the generated config.json instead of hand-editing it (the composed
 *  file is overwritten on every publish). */
export interface L5RuntimeCustomize {
  clientShell?: ProjectClientShellConfig;
  publication?: PublicationConfig;
  shellTemplates?: { spa: string; pwa: string };
  navigationLabels?: Record<string, string>;
}

export interface L5ProjectJson {
  orgName?: string;
  designSystems?: Array<Record<string, unknown>>;
  languages?: L5Language[];
  plugins?: Record<string, unknown>;
  reasons?: Record<string, unknown>;
  services?: unknown[];
  links?: unknown[];
  servicesConfigEnabled?: boolean;
  masters?: L5Masters;
  modules?: L5Module[];
  dependencies?: L5Dependency[];
  customize?: L5RuntimeCustomize;
}

// ── L4 context-resolution contract ──────────────────────────────────────────

export type L4ContextSource =
  | 'userInput'
  | 'actorSession'
  | 'currentWorkspace'
  | 'selectedEntity'
  | 'activeLifecycleInstance'
  | 'workflowState'
  | 'routeParam'
  | 'previousStepOutput'
  | 'systemDefault';

export const L4_CONTEXT_ORIGIN_CATALOG = {
  actorSession: ['actorSession.actorId', 'actorSession.scope'],
  currentWorkspace: ['currentWorkspace.workspaceId'],
  systemDefault: ['systemDefault.now', 'systemDefault.uuid', 'systemDefault.locale'],
} as const;

export interface L4ContextResolution {
  inputId?: string;
  /** Entity.field, input.<inputId>, filter.<name>, or a catalogued runtime context attribute. */
  targetRef: string;
  source: L4ContextSource;
  originRef: string;
  description: string;
}

// ── L5 generation todo contract ─────────────────────────────────────────────

export type L5GenerationTodoLayer = 'frontend' | 'backend';
export type L5GenerationTodoStatus = 'toCreate' | 'toUpdate' | 'toRemove' | 'inProgress' | 'done';
export type L5GenerationTodoOwnerType = 'workflow' | 'operation';

export interface L5GenerationTodoOwner {
  ownerType: L5GenerationTodoOwnerType;
  ownerId: string;
  title: string;
  status: L5GenerationTodoStatus;
  defPath: string;
  pageId?: string;
  commandName?: string;
  bffName?: string;
  capabilityId?: string;
}

export interface L5GenerationTodo {
  schemaVersion: string;
  moduleName: string;
  layer: L5GenerationTodoLayer;
  updatedAt: string;
  owners: L5GenerationTodoOwner[];
}
