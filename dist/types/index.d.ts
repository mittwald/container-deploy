import { Duration } from "../utils/helpers.js";
import { MittwaldAPIV2Client, type MittwaldAPIV2 } from "@mittwald/api-client";
export type RepositoryData = {
    buildContext: string;
    ports: string[];
    dockerfilePath?: string;
    dockerfileContent?: string;
    dockerfileCreated?: boolean;
    imageId?: string;
    imageName?: string;
    railpackPlanPath?: string | null;
};
export type DeployRes = {
    serviceName: string;
    deployedServiceId: string;
};
export type RegistryData = {
    username: string;
    password: string;
    uri: string;
    host?: string;
    registryServiceId: string;
    registry: any;
    created?: boolean;
};
export type DeployResult = {
    deployedServiceId: string;
    serviceName: string;
};
export type DeployOptions = {
    apiClient: MittwaldAPIV2Client;
    projectId: string;
    waitTimeout: Duration;
    environment?: Record<string, string>;
};
/**
 * Ingress (domain) data from Mittwald API.
 * Uses the native type from @mittwald/api-client for full compatibility.
 *
 * Note: DomainData can represent an ingress at various stages:
 * - After creation (has id and basic properties)
 * - After waiting (has ips and tls information)
 * - During listing (filtered by hostname)
 */
export type DomainData = Partial<MittwaldAPIV2.Components.Schemas.IngressIngress> & {
    id: string;
};
export type DomainCreateOptions = {
    apiClient: MittwaldAPIV2Client;
    projectId: string;
    hostname: string;
    serviceId: string;
    portProtocol?: string;
    timeout?: Duration;
};
//# sourceMappingURL=index.d.ts.map