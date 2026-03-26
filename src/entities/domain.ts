/*
    Helper module to manage project domains,
    provides functions to create domains via API client and wait for them to be reachable
*/

import {
    MittwaldAPIV2Client,
    assertStatus,
    type MittwaldAPIV2,
} from "@mittwald/api-client";

import {
    Duration,
    waitUntil,
} from "../utils/helpers.js";

import {
    DomainData,
} from "../types/index.js";

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
export async function createDomain(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    hostname: string,
    serviceId: string,
    portProtocol: string = "80/tcp",
): Promise<DomainData> {
    const createIngressResp = await apiClient.domain.ingressCreateIngress({
        data: {
            projectId,
            hostname,
            paths: [
                {
                    path: "/",
                    target: {
                        container: {
                            id: serviceId,
                            portProtocol,
                        },
                    },
                },
            ],
        },
    });
    assertStatus(createIngressResp, 201);
    return createIngressResp.data;
}

/**
 * Waits for a domain/ingress to be reachable after creation.
 * Polls the API to check ingress status including IP assignment and TLS creation.
 *
 * @param apiClient The Mittwald API client instance
 * @param ingressId The ingress ID to check
 * @param timeout The maximum time to wait for the domain to be reachable
 * @returns true when the domain becomes reachable
 */
export async function waitForDomainReachable(
    apiClient: MittwaldAPIV2Client,
    ingressId: string,
    timeout: Duration = Duration.fromSeconds(300),
): Promise<boolean> {
    await waitUntil(async () => {
        try {
            const statusResp = await apiClient.domain.ingressGetIngress({
                ingressId,
            });

            if (statusResp.status !== 200) {
                return null;
            }

            const ingressData = statusResp.data as DomainData;
            if (ingressData.ips?.v4?.length === 0) {
                return null;
            }

            // Check TLS readiness - handle both ACME and Certificate types
            const tlsConfig = ingressData.tls as any;
            if (!tlsConfig || tlsConfig.isCreated !== true) {
                return null;
            }

            return true;
        } catch (error) {
            return null;
        }
    }, timeout);

    return true;
}

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
export async function waitForIngressReady(
    apiClient: MittwaldAPIV2Client,
    ingressId: string,
    timeout: Duration = Duration.fromSeconds(300),
): Promise<boolean> {
    return await waitForDomainReachable(apiClient, ingressId, timeout);
}

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
export async function findDomainByHostname(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    hostname: string,
): Promise<DomainData | null> {
    try {
        const listResp = await apiClient.domain.ingressListIngresses({
            queryParameters: { projectId },
        });
        assertStatus(listResp, 200);

        const ingresses = listResp.data as DomainData[];
        const existingIngress = ingresses.find((ing) => ing.hostname === hostname);

        return existingIngress || null;
    } catch (error) {
        throw new Error(`Failed to look up domain by hostname "${hostname}": ${error}`);
    }
}

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
export async function updateDomainPathTarget(
    apiClient: MittwaldAPIV2Client,
    ingressId: string,
    serviceId: string,
    portProtocol: string = "80/tcp",
): Promise<DomainData> {
    try {
        // Fetch current ingress configuration
        const getResp = await apiClient.domain.ingressGetIngress({
            ingressId,
        });
        assertStatus(getResp, 200);

        const currentIngress = getResp.data as DomainData;
        const currentPaths = currentIngress.paths || [];

        // Update only the root "/" path's target, preserve all others
        const updatedPaths = currentPaths.map((path) => {
            if (path.path === "/") {
                return {
                    ...path,
                    target: {
                        container: {
                            id: serviceId,
                            portProtocol,
                        },
                    },
                };
            }
            return path;
        });

        // Call update API with merged paths
        // Cast to any is necessary due to strict API types - we're modifying the target property
        // of an existing path object, which the API will accept
        const updateResp = await apiClient.domain.ingressUpdateIngressPaths({
            ingressId,
            data: updatedPaths as any,
        });

        // Update endpoint returns 204 No Content on success
        if (updateResp.status !== 204) {
            throw new Error(`Failed to update ingress paths: status ${updateResp.status}`);
        }

        // Fetch updated ingress to return complete data
        const updatedResp = await apiClient.domain.ingressGetIngress({
            ingressId,
        });
        assertStatus(updatedResp, 200);

        return updatedResp.data;
    } catch (error) {
        throw new Error(`Failed to update domain path target for ingress "${ingressId}": ${error}`);
    }
}

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
export async function waitForDomainReachability(
    uri: string,
    timeout: Duration = Duration.fromSeconds(300),
): Promise<void> {
    await waitUntil(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second HTTP timeout

            const response = await fetch(`https://${uri}/v2/`, {
                method: "HEAD",
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Verify this is a real Docker registry by checking for the Docker registry header
            // This header is specifically returned by Docker registry v2 API
            const dockerDistributionHeader = response.headers.get("docker-distribution-api-version");
            
            if (dockerDistributionHeader === "registry/2.0") {
                return true;
            }

            // Not yet ready - return null to retry
            return null;
        } catch (error) {
            // Connection errors or timeouts - retry
            return null;
        }
    }, timeout);
}

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
export async function createAndWaitForDomain(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    hostname: string,
    serviceId: string,
    portProtocol: string = "80/tcp",
    timeout: Duration = Duration.fromSeconds(300),
): Promise<DomainData & { wasReused?: boolean }> {
    // Check if domain with this hostname already exists
    const existingDomain = await findDomainByHostname(apiClient, projectId, hostname);

    let domain: DomainData;
    let wasReused = false;

    if (existingDomain) {
        // Reuse existing domain: update its target path
        console.log(`Reusing existing domain for hostname "${hostname}"`);
        domain = await updateDomainPathTarget(apiClient, existingDomain.id, serviceId, portProtocol);
        wasReused = true;
    } else {
        // Create new domain
        console.log(`Creating new domain for hostname "${hostname}"`);
        domain = await createDomain(apiClient, projectId, hostname, serviceId, portProtocol);
    }

    // Wait for domain to be ready (reachable and TLS provisioned)
    await waitForIngressReady(apiClient, domain.id, timeout);

    return {
        ...domain,
        wasReused,
    };
}
