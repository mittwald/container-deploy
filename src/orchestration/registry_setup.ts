/*
    Orchestration module for complete registry setup.
    Coordinates service deployment, domain creation, and registry registration.
    Handles the multi-step process of setting up a project registry from scratch.
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
    createRegistry,
    checkProjectRegistry,
} from "../entities/registry.js";
import { deployServiceAs } from "../entities/service.js";
import { createAndWaitForDomain, waitForDomainReachability } from "../entities/domain.js";

import type { RegistryData } from "../types/index.js";

// Registry service configuration
const MW_REGISTRY_SERVICE_NAME = "project-registry";
const MW_REGISTRY_IMAGE = "mittwald/registry:3";
const MW_REGISTRY_PORTS = ["5000:5000/tcp"];
const MW_REGISTRY_PORT_PROTOCOL = "5000/tcp";

/**
 * Helper: Generate a unique username for registry credentials.
 */
function generateUsername(): string {
    return `user_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Orchestrates the complete setup of a project registry.
 * If a registry already exists, returns its information.
 * If not, creates: service → ingress/domain → registry API record.
 *
 * WARNING: The ingress setup is known to be flaky. This step includes
 * a 2-minute wait to allow DNS propagation and TLS certificate creation.
 * See: https://docs.mittwald.de/ for known issues.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the registry should be created
 * @param projectShortId The short ID of the project (for domain subdomain)
 * @param timeout Maximum time to wait for service/domain availability
 * @returns Registry information including credentials and service ID
 */
export async function setupProjectRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    projectShortId: string,
    timeout: Duration,
): Promise<RegistryData> {
    let registryInfo: RegistryData;

    // Step 1: Check if registry already exists
    const registry = await getProjectRegistry(apiClient, projectId);

    if (!registry) {
        // Step 2: Generate credentials for new registry
        const username = generateUsername();
        const password = generatePasswordWithSpecialChars();
        const subdomain = `registry.${projectShortId}`;
        const uri = `${subdomain}.project.space`;

        // Step 3: Deploy registry service
        const registryServiceId = await deployServiceAs(
            apiClient,
            projectId,
            MW_REGISTRY_SERVICE_NAME,
            {
                image: MW_REGISTRY_IMAGE,
                description: "Project private registry",
                environment: {
                    REGISTRY_USER: username,
                    REGISTRY_PASSWORD: password,
                },
                ports: MW_REGISTRY_PORTS,
            },
            timeout,
        );

        // Step 4: Create domain/ingress for registry
        const domainResult = await createAndWaitForDomain(
            apiClient,
            projectId,
            uri,
            registryServiceId,
            MW_REGISTRY_PORT_PROTOCOL,
            timeout,
        );

        // Step 5: Verify registry is HTTP-reachable before registering in API
        // This ensures we don't register a registry that's not yet accessible, preventing
        // race conditions where subsequent operations fail because the registry endpoint is unreachable.
        // Polling the /v2/ endpoint actively verifies the service is responding over HTTP.
        await waitForDomainReachability(uri, timeout);

        // Step 6: Register the registry in Mittwald API
        const registryCreationPayload = {
            uri,
            description: `Default registry for project ${projectId}`,
            credentials: { username, password },
        };
        const createdRegistry = await createRegistry(
            apiClient,
            projectId,
            registryCreationPayload,
        );

        registryInfo = {
            username,
            password,
            uri,
            registryServiceId,
            registry: createdRegistry,
            created: true,
        };
    } else {
        // Registry exists: fetch and validate credentials
        registryInfo = await checkProjectRegistry(
            apiClient,
            projectId,
            registry,
        );
        registryInfo.created = false;
    }

    return registryInfo;
}
