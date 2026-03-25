// Main orchestration function
export { deployProject } from "./orchestration/deploy_project.js";

// Registry orchestration
export { setupProjectRegistry } from "./orchestration/registry_setup.js";

// Docker operations
export {
  buildDockerImage,
  localDockerPush,
  checkDocker,
  checkRailpack
} from "./entities/docker.js";

// Entity operations
export { 
  getProjectRegistry, 
  createRegistry,
  checkProjectRegistry 
} from "./entities/registry.js";
export { checkRepository } from "./entities/repository.js";
export { deployService } from "./entities/service.js";
export { getProjectShortIdFromUuid } from "./entities/project.js";
export { 
  createDomain,
  waitForDomainReachable,
  waitForIngressReady,
  createAndWaitForDomain
} from "./entities/domain.js";

// Type exports
export type { DeployOptions, DeployResult } from "./types/index.js";
export type {
  RepositoryData,
  RegistryData,
  DeployRes
} from "./types/index.js";
