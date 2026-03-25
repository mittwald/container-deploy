/*
    Helper module to manage project domains,
    provides functions to create domains via API client and wait for them to be reachable
*/

import {
    MittwaldAPIV2Client,
    assertStatus,
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

            if (statusResp.data.ips?.v4?.length === 0) {
                return null;
            }

            if ((statusResp.data as any).tls?.isCreated !== true) {
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
 * Combines domain creation and waiting for it to be reachable.
 * First creates the domain, then waits for it to be fully operational via API.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the domain should be created
 * @param hostname The hostname/domain name to create
 * @param serviceId The container service ID to route to
 * @param portProtocol The port and protocol to route to (e.g., "80/tcp")
 * @param timeout The maximum time to wait for the domain to be reachable
 * @returns The created domain information after it becomes reachable
 */
export async function createAndWaitForDomain(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    hostname: string,
    serviceId: string,
    portProtocol: string = "80/tcp",
    timeout: Duration = Duration.fromSeconds(300),
): Promise<DomainData> {
    const domain = await createDomain(apiClient, projectId, hostname, serviceId, portProtocol);
    await waitForIngressReady(apiClient, domain.id, timeout);
    return domain;
}
