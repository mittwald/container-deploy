/*
    Helper module to manage project registries.
    Pure registry API operations — no service/domain orchestration.
    Factored out for reuse in multiple commands and programs.
*/

import {
    MittwaldAPIV2Client,
    assertStatus,
    MittwaldAPIV2,
} from "@mittwald/api-client";

import type {
    RegistryData,
} from "../types/index.js";
import { findDefaultDomain } from "./domain.js";

// type shorthands
type Registry = MittwaldAPIV2.Components.Schemas.ContainerRegistry;

/** Name of the container service that runs the project registry. */
export const MW_REGISTRY_SERVICE_NAME = "project-registry";
export const MW_REGISTRY_PORT_PROTOCOL = "5000/tcp";

/**
 * Returns the URI of the project registry, which is the `registry`
 * subdomain of the project's default domain.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID
 * @returns The registry URI, e.g. `registry.<projectShortId>.project.space`
 */
export async function getProjectRegistryUri(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
): Promise<string> {
    const defaultDomain = await findDefaultDomain(apiClient, projectId);
    return `registry.${defaultDomain.hostname}`;
}

/**
 * Fetches the registry with the given URI from a project.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID to fetch registry for
 * @param uri The URI of the registry
 * @returns The registry object, or undefined if no registry has that URI
 */
export async function findRegistryByUri(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    uri: string,
): Promise<Registry | undefined> {
    const registriesResp = await apiClient.container.listRegistries({
        projectId,
    });
    assertStatus(registriesResp, 200);

    return registriesResp.data.find(r => r.uri === uri);
}

/**
 * Fetches the project registry, identified by its URI (see
 * `getProjectRegistryUri`). Other registries configured in the project
 * are ignored.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID to fetch registry for
 * @returns The registry object, or undefined if no project registry exists
 */
export async function getProjectRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
): Promise<Registry | undefined> {
    const uri = await getProjectRegistryUri(apiClient, projectId);
    return findRegistryByUri(apiClient, projectId, uri);
}

/**
 * Creates a new registry in the Mittwald API.
 * Does NOT handle service/domain setup — that is orchestration responsibility.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID where the registry should be created
 * @param data Registry creation payload with uri, description, and credentials
 * @returns The created registry object
 */
export async function createRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    data: {
        uri: string;
        description: string;
        credentials: { username: string; password: string };
    },
) {
    const createResp = await apiClient.container.createRegistry({
        projectId,
        data,
    });
    assertStatus(createResp, 201);
    return createResp.data;
}

/**
 * Sets the credentials of an existing registry in the Mittwald API.
 *
 * @param apiClient The Mittwald API client instance
 * @param registryId The ID of the registry to update
 * @param credentials The credentials to store for the registry
 */
export async function updateRegistryCredentials(
    apiClient: MittwaldAPIV2Client,
    registryId: string,
    credentials: { username: string; password: string },
): Promise<void> {
    const updateResp = await apiClient.container.updateRegistry({
        registryId,
        data: { credentials },
    });
    assertStatus(updateResp, 204);
}

/**
 * Checks whether an error thrown by `createRegistry` or
 * `updateRegistryCredentials` means that the API could not reach a registry
 * at the registry URI (`400 ValidationError: registry uri '...' does not host
 * a registry`). This happens while a new or re-targeted ingress has not yet
 * propagated, and usually resolves after some time.
 *
 * @param error The error thrown by the API call (an `ApiClientError` from
 *     `assertStatus`, which carries the API response)
 * @returns true if the error is the "does not host a registry" validation error
 */
export function isRegistryUriNotReachableError(error: unknown): boolean {
    const response = (error as { response?: { status?: number; data?: any } } | null)?.response;
    if (response?.status !== 400) {
        return false;
    }

    const message = response.data?.message;
    return typeof message === "string" && message.includes("does not host a registry");
}

/**
 * Looks up the registry service in a stack and reads its credentials
 * from the deployed environment.
 *
 * @param apiClient The Mittwald API client instance
 * @param stackId The ID of the stack hosting the registry service
 * @returns The service ID and credentials (empty if not set), or undefined if
 *     the stack has no registry service
 */
export async function getRegistryService(
    apiClient: MittwaldAPIV2Client,
    stackId: string,
): Promise<{ serviceId: string; username: string; password: string } | undefined> {
    const stackResp = await apiClient.container.getStack({
        stackId,
    });
    assertStatus(stackResp, 200);

    const registryService = stackResp.data.services?.find(
        svc => svc.serviceName === MW_REGISTRY_SERVICE_NAME
    );

    if (!registryService) {
        return undefined;
    }

    const serviceDetailsResp = await apiClient.container.getService({
        serviceId: registryService.id,
        stackId,
    });
    assertStatus(serviceDetailsResp, 200);

    const envs = serviceDetailsResp.data.deployedState?.envs;
    return {
        serviceId: registryService.id,
        username: envs?.REGISTRY_USER ?? "",
        password: envs?.REGISTRY_PASSWORD ?? "",
    };
}

/**
 * Checks and extracts credentials from an existing registry service.
 * Validates that the service and domain are properly configured.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID
 * @param stackId The ID of the stack hosting the registry service
 * @param registry The registry object to check
 * @returns RegistryData with credentials and configuration
 */
export async function checkProjectRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    stackId: string,
    registry: Registry,
): Promise<RegistryData> {
    /*
        Check existing registry for project. Extract credentials from
        service environment and validate ingress is configured.
    */

    const registryService = await getRegistryService(apiClient, stackId);

    if (!registryService) {
        throw new Error(
            "Registry service not found. Unable to retrieve credentials."
        );
    }

    const { serviceId: registryServiceId, username, password } = registryService;

    if (!username || !password) {
        throw new Error(
            "Registry credentials not found in service environment variables."
        );
    }

    const uri = registry.uri || "";

    /*
        NOTE: Circular dependency issue with API client generation.

        The modern endpoint (GET /v2/ingresses) does not work in all scopes/contexts.
        The deprecated endpoint (GET /v2/projects/{projectId}/ingresses) would be ideal,
        but the API client generator explicitly filters out deprecated operations.

        Reference: The @mittwald/api-client generator does not export deprecated operations
        to force migration to new endpoints. However, the deprecated endpoint is sometimes
        the only working solution for certain use cases.

        Generator code: https://github.com/mittwald/api-client-js/blob/master/packages/generator/src/generation/model/paths/Path.ts
        Commit: "Do not export deprecated operations" (88474cd, 3 years ago)

        Solution: Use the underlying axios HTTP client to call the deprecated endpoint directly.
        Authentication is automatically handled via axios interceptors set up by the API client.
    */
    const ingressesResp = await apiClient.axios.get(
        `/v2/projects/${projectId}/ingresses`
    );
    
    if (ingressesResp.status !== 200) {
        throw new Error(
            `Failed to fetch ingresses for project ${projectId}. Status: ${ingressesResp.status}`
        );
    }

    const ingresses = ingressesResp.data as any[];
    const registryIngress = ingresses.find((ingress: any) => {
        return ingress.paths?.some((path: any) => {
            const target = path.target as any;
            return (
                'container' in target &&
                target.container?.id === registryServiceId &&
                target.container?.portProtocol === MW_REGISTRY_PORT_PROTOCOL
            );
        });
    });

    if (!registryIngress) {
        throw new Error(
            `Registry ingress not found. Registry is not exposed via domain. Available ingresses: ${JSON.stringify(ingresses, null, 2)}`
        );
    }

    return {
        username,
        password,
        uri,
        registryServiceId,
        registry,
    };
}