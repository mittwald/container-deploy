import { RegistryData, RepositoryData } from "../types/index.js";
export declare function checkDocker(): void;
export declare function checkRailpack(): void;
export declare function localDockerBuild(registryData: RegistryData, repositoryData: RepositoryData): Promise<RepositoryData>;
export declare function localBuildWithRailpack(registryData: RegistryData, repositoryData: RepositoryData): Promise<RepositoryData>;
export declare function buildDockerImage(registryData: RegistryData, repositoryData: RepositoryData): Promise<RepositoryData>;
export declare function localDockerPush(repositoryData: RepositoryData, registryData: RegistryData): Promise<void>;
//# sourceMappingURL=docker.d.ts.map