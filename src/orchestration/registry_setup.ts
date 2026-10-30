/*
    Orchestration module for complete registry setup.
    Coordinates service deployment, domain creation, and registry registration.
    Brings a project registry into the desired state from whatever state it is
    currently in (nothing set up, partially set up, or fully set up).
*/

import {
    MittwaldAPIV2Client,
} from "@mittwald/api-client";

import {
    Duration,
    generatePasswordWithSpecialChars,
} from "../utils/helpers.js";

import {
    findRegistryByUri,
    getProjectRegistryUri,
    getRegistryService,
    createRegistry,
    updateRegistryCredentials,
    isRegistryUriNotReachableError,
    MW_REGISTRY_SERVICE_NAME,
    MW_REGISTRY_PORT_PROTOCOL,
} from "../entities/registry.js";
import { deployServiceAs } from "../entities/service.js";
import {
    createAndWaitForDomain,
    findDomainByHostname,
    waitForDomainReachability,
} from "../entities/domain.js";

import type { DomainData, RegistryData } from "../types/index.js";

// Registry service configuration
const MW_REGISTRY_IMAGE = "mittwald/registry:3";
const MW_REGISTRY_PORTS = ["5000:5000/tcp"];
// Persist pushed images by mounting a named volume at the registry's storage
// directory. Without this, all images in the registry are lost whenever the
// container is recreated. See: https://github.com/mittwald/container-deploy/issues/17
const MW_REGISTRY_VOLUMES = [
    { name: "project-registry-data", mountPath: "/var/lib/registry" },
];

// Interval between attempts to register the registry in the API while the
// API cannot reach it at its URI yet.
const REGISTRY_URI_RETRY_INTERVAL = Duration.fromSeconds(10);

/**
 * Helper: Generate a unique username for registry credentials.
 */
function generateUsername(): string {
    return `user_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Helper: Check whether an ingress routes its root path to the given
 * registry service.
 */
function routesToRegistryService(ingress: DomainData, serviceId: string): boolean {
    return (ingress.paths ?? []).some(path => {
        const target = path.target as any;
        return (
            path.path === "/" &&
            target.container?.id === serviceId &&
            target.container?.portProtocol === MW_REGISTRY_PORT_PROTOCOL
        );
    });
}

/**
 * Helper: Run a registry API operation, and retry it while the API reports
 * that it cannot reach a registry at the registry URI. The API validates the
 * URI from its own side, so this covers DNS propagation and TLS certificate
 * issuance for new ingresses as well as propagation of re-targeted ones.
 * Other errors are thrown immediately; after the timeout, the last API error
 * is thrown.
 */
async function retryWhileRegistryUriNotReachable<T>(
    operation: () => Promise<T>,
    timeout: Duration,
): Promise<T> {
    let waited = Duration.fromZero();
    while (true) {
        try {
            return await operation();
        } catch (error) {
            if (!isRegistryUriNotReachableError(error) || waited.compare(timeout) >= 0) {
                throw error;
            }
        }

        await new Promise(resolve => setTimeout(resolve, REGISTRY_URI_RETRY_INTERVAL.milliseconds));
        waited = waited.add(REGISTRY_URI_RETRY_INTERVAL);
    }
}

/**
 * Orchestrates the complete setup of a project registry.
 *
 * Reconciles each part of the registry with the desired state, so that it
 * recovers from partially set up registries:
 *
 * 1. a `project-registry` service is running in the given stack (existing
 *    credentials from its environment are kept),
 * 2. an ingress at the `registry` subdomain of the project's default domain
 *    (e.g. `registry.<projectShortId>.project.space`) routes to it,
 * 3. the project has a registry record for that URI, with the credentials
 *    from the service's environment.
 *
 * Other registries configured in the project are left alone.
 *
 * After a new or re-targeted ingress, it can take a while until the API can
 * reach the registry at its URI (DNS propagation, TLS certificate issuance).
 * Until then, the API rejects the registry record with a validation error for
 * its URI ("is not reachable", "does not host a registry"); this step is
 * retried until the API accepts it or the timeout is exhausted.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the registry should be created
 * @param stackId The ID of the existing stack hosting the registry service
 * @param _projectShortId Unused; the registry hostname is derived from the
 *     project's default domain. Kept for backwards compatibility.
 * @param timeout Maximum time to wait for service/domain availability, and
 *     for the API to accept the registry URI
 * @returns Registry information including credentials and service ID;
 *     `created` is true if the registry record was created in this run
 */
export async function setupProjectRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    stackId: string,
    _projectShortId: string | undefined,
    timeout: Duration,
): Promise<RegistryData> {
    const uri = await getProjectRegistryUri(apiClient, projectId);

    // Step 1: Determine the current state
    const registry = await findRegistryByUri(apiClient, projectId, uri);
    const existingService = await getRegistryService(apiClient, stackId);

    // Step 2: Deploy the registry service, unless it already exists with
    // credentials. Existing credentials are never replaced, so that clients
    // that already authenticated against the registry keep working.
    let registryServiceId: string;
    let username: string;
    let password: string;
    let serviceDeployed = false;

    if (existingService?.username && existingService.password) {
        ({ serviceId: registryServiceId, username, password } = existingService);
    } else {
        username = generateUsername();
        password = generatePasswordWithSpecialChars();

        registryServiceId = await deployServiceAs(
            apiClient,
            projectId,
            stackId,
            MW_REGISTRY_SERVICE_NAME,
            {
                image: MW_REGISTRY_IMAGE,
                description: "Project private registry",
                environment: {
                    REGISTRY_USER: username,
                    REGISTRY_PASSWORD: password,
                },
                ports: MW_REGISTRY_PORTS,
                volumes: MW_REGISTRY_VOLUMES,
            },
            timeout,
        );
        serviceDeployed = true;
    }

    // Step 3: Create the ingress, or re-target it to the registry service
    const existingIngress = await findDomainByHostname(apiClient, projectId, uri);
    const ingressConfigured =
        existingIngress !== null && routesToRegistryService(existingIngress, registryServiceId);

    if (!ingressConfigured) {
        await createAndWaitForDomain(
            apiClient,
            projectId,
            uri,
            registryServiceId,
            MW_REGISTRY_PORT_PROTOCOL,
            timeout,
        );
    }

    if (serviceDeployed || !ingressConfigured) {
        // Step 4: Verify registry is HTTP-reachable before registering in API
        // This ensures we don't register a registry that's not yet accessible, preventing
        // race conditions where subsequent operations fail because the registry endpoint is unreachable.
        // Polling the /v2/ endpoint actively verifies the service is responding over HTTP.
        await waitForDomainReachability(uri, timeout);
    }

    // Step 5: Register the registry in Mittwald API, or update its credentials.
    // The API does not return stored passwords, so credentials are always set
    // to make sure they match the service.
    // Us reaching the registry (step 4) does not mean that the API can reach it,
    // due to DNS caching and propagation of new or re-targeted ingresses. The API
    // validates the registry URI itself, so retry while it cannot reach it yet.
    const credentials = { username, password };
    let registryRecord = registry;

    if (registry) {
        await retryWhileRegistryUriNotReachable(
            () => updateRegistryCredentials(apiClient, registry.id, credentials),
            timeout,
        );
    } else {
        registryRecord = await retryWhileRegistryUriNotReachable(
            () => createRegistry(apiClient, projectId, {
                uri,
                description: `Default registry for project ${projectId}`,
                credentials,
            }),
            timeout,
        );
    }

    return {
        username,
        password,
        uri,
        registryServiceId,
        registry: registryRecord,
        created: !registry,
    };
}
