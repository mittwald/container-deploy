// Main orchestration function
export { deployProject } from "./orchestration/deploy_project.js";

// Individual orchestration functions
export {
  setupProjectRegistry,
  buildDockerImage,
  localDockerPush,
  checkDocker,
  checkRailpack
} from "./entities/registry.js";
export { checkRepository } from "./entities/repository.js";
export { deployService } from "./entities/service.js";
export { getProjectShortIdFromUuid } from "./entities/project.js";

// Type exports
export type { DeployOptions, DeployResult } from "./types/index.js";
export type {
  RepositoryData,
  RegistryData,
  DeployRes
} from "./types/index.js";
