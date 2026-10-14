import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { Duration } from "../utils/helpers.js";
import { DomainData } from "../types/index.js";
/**
 * Creates a new domain/ingress for a given project and service
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the domain should be created
 * @param hostname The hostname/domain name to create
 * @param serviceId The container service ID to route to
 * @param portProtocol The port and protocol to route to (e.g., "80/tcp")
 * @returns The created ingress information
 */
export declare function createDomain(apiClient: MittwaldAPIV2Client, projectId: string, hostname: string, serviceId: string, portProtocol?: string): Promise<DomainData>;
/**
 * Waits for a domain/ingress to be reachable after creation.
 * Polls the API to check ingress status including IP assignment and TLS creation.
 *
 * @param apiClient The Mittwald API client instance
 * @param ingressId The ingress ID to check
 * @param timeout The maximum time to wait for the domain to be reachable
 * @returns true when the domain becomes reachable
 */
export declare function waitForDomainReachable(apiClient: MittwaldAPIV2Client, ingressId: string, timeout?: Duration): Promise<boolean>;
/**
 * Waits for an ingress to be fully ready with assigned IPs and TLS.
 * This is an alias for waitForDomainReachable, extracted for semantic clarity
 * when used in orchestration modules.
 *
 * @param apiClient The Mittwald API client instance
 * @param ingressId The ingress ID to check
 * @param timeout The maximum time to wait for the ingress to be ready
 * @returns true when the ingress is ready
 */
export declare function waitForIngressReady(apiClient: MittwaldAPIV2Client, ingressId: string, timeout?: Duration): Promise<boolean>;
/**
 * Finds an existing domain/ingress by hostname for a given project.
 * Lists all ingresses and filters by hostname to locate an existing domain.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID to search ingresses in
 * @param hostname The hostname to search for
 * @returns The ingress object if found, null if not found
 * @throws Error if API call fails
 */
export declare function findDomainByHostname(apiClient: MittwaldAPIV2Client, projectId: string, hostname: string): Promise<DomainData | null>;
/**
 * Updates the target path of an existing domain/ingress.
 * Fetches the current ingress configuration, updates only the root "/" path target,
 * and preserves all other paths to avoid side-effects.
 *
 * @param apiClient The Mittwald API client instance
 * @param ingressId The ingress ID to update
 * @param serviceId The new container service ID to route to
 * @param portProtocol The new port and protocol to route to (e.g., "80/tcp")
 * @returns The updated ingress information
 * @throws Error if API call fails
 */
export declare function updateDomainPathTarget(apiClient: MittwaldAPIV2Client, ingressId: string, serviceId: string, portProtocol?: string): Promise<DomainData>;
/**
 * Waits for a domain to be HTTP reachable and verifies it's a real Docker registry.
 * Polls the Docker registry v2 API endpoint and validates the response headers
 * to confirm the registry is actually responding with the expected Docker registry signature.
 * This strict check prevents false positives from generic web servers.
 *
 * @param uri The domain URI to check (e.g., "registry.project.project.space")
 * @param timeout The maximum time to wait for registry reachability
 * @throws Error if registry does not respond correctly within the timeout period
 */
export declare function waitForDomainReachability(uri: string, timeout?: Duration): Promise<void>;
/**
 * Combines domain creation and waiting for it to be reachable.
 * First checks if a domain with the given hostname already exists.
 * If it does, updates its target path and waits for readiness.
 * If not, creates a new domain and waits for it to be fully operational via API.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the domain should be created
 * @param hostname The hostname/domain name to create or reuse
 * @param serviceId The container service ID to route to
 * @param portProtocol The port and protocol to route to (e.g., "80/tcp")
 * @param timeout The maximum time to wait for the domain to be reachable
 * @returns The domain information after it becomes reachable, with `wasReused` flag indicating if existing domain was reused
 */
export declare function createAndWaitForDomain(apiClient: MittwaldAPIV2Client, projectId: string, hostname: string, serviceId: string, portProtocol?: string, timeout?: Duration): Promise<DomainData & {
    wasReused?: boolean;
}>;
//# sourceMappingURL=domain.d.ts.map