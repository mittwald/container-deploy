import { RegistryData, RepositoryData } from "../types/index.js";
interface ToolCheckResult {
    available: boolean;
    error?: string;
}
export declare const DEFAULT_IMAGE_NAME = "app-image";
export declare const DEFAULT_IMAGE_TAG = "latest";
export interface ImageOptions {
    name?: string;
    tag?: string;
}
/**
 * Checks if Docker is installed and available in the system PATH. Returns a
 * result object indicating availability and error details if unavailable.
 */
export declare function checkDocker(): ToolCheckResult;
/**
 * Checks if Railpack is installed and available in the system PATH. Returns a
 * result object indicating availability and error details if unavailable.
 */
export declare function checkRailpack(): ToolCheckResult;
/**
 * Validates that both Docker and Railpack are installed. Collects all missing
 * tools and throws a single comprehensive error.
 */
export declare function checkRequiredTools(): void;
/**
 * Builds a Docker image from the local repository. Later down the line this
 * might be called remotely.
 */
export declare function localDockerBuild(registryData: RegistryData, repositoryData: RepositoryData, imageOptions?: ImageOptions): Promise<RepositoryData>;
/**
 * Builds a Docker image using Railpack and Docker Buildx (BuildKit). This path
 * is more efficient for complex projects and provides better caching and
 * multi-platform builds.
 */
export declare function localBuildWithRailpack(registryData: RegistryData, repositoryData: RepositoryData, imageOptions?: ImageOptions): Promise<RepositoryData>;
/**
 * Entry point for building Docker images. Checks if `railpackPlanPath` is
 * available and decides which build method to use:
 * - If `railpackPlanPath` exists: uses Buildx with Railpack.
 * - Otherwise: falls back to a standard Docker build.
 */
export declare function buildDockerImage(registryData: RegistryData, repositoryData: RepositoryData, imageOptions?: ImageOptions): Promise<RepositoryData>;
/**
 * Pushes the built Docker image to the registry. Logs in to the registry first
 * with the provided credentials.
 */
export declare function localDockerPush(repositoryData: RepositoryData, registryData: RegistryData): Promise<void>;
export {};
//# sourceMappingURL=docker.d.ts.map