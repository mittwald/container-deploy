import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { Duration } from "../utils/helpers.js";
import { DeployRes, RepositoryData } from "../types/index.js";
export declare function deployService(apiClient: MittwaldAPIV2Client, projectId: string, repositoryData: RepositoryData, timeout: Duration, environment?: Record<string, string>): Promise<DeployRes>;
/**
 * Generic service deployment function.
 * Deploys a service with given configuration to a project stack.
 * Returns the deployed service ID after it transitions to "running" state.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID (used as stack ID)
 * @param serviceName The name of the service to deploy
 * @param serviceConfig Service configuration (image, description, environment, ports)
 * @param timeout Maximum time to wait for the service to be running
 * @returns The ID of the deployed service
 */
export declare function deployServiceAs(apiClient: MittwaldAPIV2Client, projectId: string, serviceName: string, serviceConfig: {
    image: string;
    description: string;
    environment?: Record<string, string>;
    ports: string[];
}, timeout: Duration): Promise<string>;
//# sourceMappingURL=service.d.ts.map