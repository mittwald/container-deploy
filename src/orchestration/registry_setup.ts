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
    getProjectRegistry,
    getRegistryService,
    createRegistry,
    updateRegistryCredentials,
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
 * Orchestrates the complete setup of a project registry.
 *
 * Reconciles each part of the registry with the desired state, so that it
 * recovers from partially set up registries:
 *
 * 1. a `project-registry` service is running in the given stack (existing
 *    credentials from its environment are kept),
 * 2. an ingress at `registry.<projectShortId>.project.space` routes to it,
 * 3. the project has a registry record for that URI, with the credentials
 *    from the service's environment.
 *
 * Other registries configured in the project are left alone.
 *
 * WARNING: The ingress setup is known to be flaky. When a new ingress is
 * created, this step includes a 2-minute wait to allow DNS propagation and
 * TLS certificate creation.
 * See: https://docs.mittwald.de/ for known issues.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the registry should be created
 * @param stackId The ID of the existing stack hosting the registry service
 * @param projectShortId The short ID of the project (for domain subdomain)
 * @param timeout Maximum time to wait for service/domain availability
 * @returns Registry information including credentials and service ID;
 *     `created` is true if the registry record was created in this run
 */
export async function setupProjectRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    stackId: string,
    projectShortId: string,
    timeout: Duration,
): Promise<RegistryData> {
    const uri = `registry.${projectShortId}.project.space`;

    // Step 1: Determine the current state
    const registry = await getProjectRegistry(apiClient, projectId, uri);
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
    let ingressCreated = false;

    if (!ingressConfigured) {
        const domainResult = await createAndWaitForDomain(
            apiClient,
            projectId,
            uri,
            registryServiceId,
            MW_REGISTRY_PORT_PROTOCOL,
            timeout,
        );
        ingressCreated = !domainResult.wasReused;
    }

    if (serviceDeployed || !ingressConfigured) {
        // Step 4: Verify registry is HTTP-reachable before registering in API
        // This ensures we don't register a registry that's not yet accessible, preventing
        // race conditions where subsequent operations fail because the registry endpoint is unreachable.
        // Polling the /v2/ endpoint actively verifies the service is responding over HTTP.
        await waitForDomainReachability(uri, timeout);
    }

    if (ingressCreated) {
        // Step 4.1: Additional wait to allow DNS propagation and TLS certificate issuance
        // WE reaching registry does not mean other machines can reach it immediately due to
        // DNS caching and whatever. This wait is a pragmatic solution to mitigate these issues.
        await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
    }

    // Step 5: Register the registry in Mittwald API, or update its credentials.
    // The API does not return stored passwords, so credentials are always set
    // to make sure they match the service.
    const credentials = { username, password };
    let registryRecord = registry;

    if (registry) {
        await updateRegistryCredentials(apiClient, registry.id, credentials);
    } else {
        registryRecord = await createRegistry(apiClient, projectId, {
            uri,
            description: `Default registry for project ${projectId}`,
            credentials,
        });
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
