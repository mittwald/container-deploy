import { MittwaldAPIV2Client, MittwaldAPIV2 } from "@mittwald/api-client";
import type { RegistryData } from "../types/index.js";
type Registry = MittwaldAPIV2.Components.Schemas.ContainerRegistry;
/**
 * Fetches the existing (non-default) registry for a project.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID to fetch registry for
 * @returns The registry object, or undefined if no custom registry exists
 */
export declare function getProjectRegistry(apiClient: MittwaldAPIV2Client, projectId: string): Promise<MittwaldAPIV2.Components.Schemas.ContainerRegistry | undefined>;
/**
 * Creates a new registry in the Mittwald API.
 * Does NOT handle service/domain setup — that is orchestration responsibility.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the registry should be created
 * @param data Registry creation payload with uri, description, and credentials
 * @returns The created registry object
 */
export declare function createRegistry(apiClient: MittwaldAPIV2Client, projectId: string, data: {
    uri: string;
    description: string;
    credentials: {
        username: string;
        password: string;
    };
}): Promise<{
    credentials?: MittwaldAPIV2.Components.Schemas.ContainerRegistryCredentials | undefined;
    description: string;
    id: string;
    projectId: string;
    uri: string;
}>;
/**
 * Checks and extracts credentials from an existing registry service.
 * Validates that the service and domain are properly configured.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID
 * @param registry The registry object to check
 * @returns RegistryData with credentials and configuration
 */
export declare function checkProjectRegistry(apiClient: MittwaldAPIV2Client, projectId: string, registry: Registry): Promise<RegistryData>;
export {};
//# sourceMappingURL=registry.d.ts.map