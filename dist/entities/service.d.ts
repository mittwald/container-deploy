import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { Duration } from "../utils/helpers.js";
import { DeployRes, NamedVolumeMount, RepositoryData } from "../types/index.js";
export declare function deployService(apiClient: MittwaldAPIV2Client, projectId: string, stackId: string, repositoryData: RepositoryData, timeout: Duration, environment?: Record<string, string>, serviceName?: string, volumes?: Record<string, string>): Promise<DeployRes>;
/**
 * Generic service deployment function.
 * Deploys a service with given configuration to a project stack.
 * Returns the deployed service ID after it transitions to "running" state.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID containing the stack
 * @param stackId The ID of the existing stack to deploy to
 * @param serviceName The name of the service to deploy
 * @param serviceConfig Service configuration (image, description, environment, ports, volumes)
 * @param timeout Maximum time to wait for the service to be running
 * @returns The ID of the deployed service
 */
export declare function deployServiceAs(apiClient: MittwaldAPIV2Client, projectId: string, stackId: string, serviceName: string, serviceConfig: {
    image: string;
    description: string;
    environment?: Record<string, string>;
    ports: string[];
    volumes?: NamedVolumeMount[];
}, timeout: Duration): Promise<string>;
//# sourceMappingURL=service.d.ts.map