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

// type shorthands
type Registry = MittwaldAPIV2.Components.Schemas.ContainerRegistry;

/**
 * Fetches the existing (non-default) registry for a project.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID to fetch registry for
 * @returns The registry object, or undefined if no custom registry exists
 */
export async function getProjectRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
) {
    /*
        Fetch the registry information for the project using the
        API client. Default registries are identified by URI
    */

    const registriesResp = await apiClient.container.listRegistries({
        projectId,
    });
    assertStatus(registriesResp, 200);

    const isDefaultRegistry = (r: Registry): boolean => {
        const uri = r.uri || "";
        return (
            uri.includes("docker.io") ||
            uri.includes("ghcr.io") ||
            uri.includes("gitlab.com")
        );
    };

    const registry = registriesResp.data.find(
        r => !isDefaultRegistry(r)
    );

    return registry;
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
 * Checks and extracts credentials from an existing registry service.
 * Validates that the service and domain are properly configured.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID
 * @param registry The registry object to check
 * @returns RegistryData with credentials and configuration
 */
export async function checkProjectRegistry(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    registry: Registry,
): Promise<RegistryData> {
    /*
        Check existing registry for project. Extract credentials from
        service environment and validate ingress is configured.
    */

    const MW_REGISTRY_SERVICE_NAME = "project-registry";
    const MW_REGISTRY_PORT_PROTOCOL = "5000/tcp";

    const servicesResp = await apiClient.container.listServices({
        projectId,
    });
    assertStatus(servicesResp, 200);

    const registryService = servicesResp.data.find(
        svc => svc.serviceName === MW_REGISTRY_SERVICE_NAME
    );

    if (!registryService) {
        throw new Error(
            "Registry service not found. Unable to retrieve credentials."
        );
    }

    const registryServiceId = registryService.id;

    const serviceDetailsResp = await apiClient.container.getService({
        serviceId: registryServiceId,
        stackId: projectId,
    });
    assertStatus(serviceDetailsResp, 200);

    const service = serviceDetailsResp.data;
    const username = service.deployedState?.envs?.REGISTRY_USER ?? "";
    const password = service.deployedState?.envs?.REGISTRY_PASSWORD ?? "";

    if (!username || !password) {
        throw new Error(
            "Registry credentials not found in service environment variables."
        );
    }

    const uri = registry.uri || "";

    const ingressesResp = await apiClient.domain.ingressListIngresses({
        queryParameters: { projectId },
    });
    assertStatus(ingressesResp, 200);

    const registryIngress = ingressesResp.data.find((ingress) => {
        return ingress.paths?.some((path) => {
            const target = path.target as any;
            return (
                target?.container?.id === registryServiceId &&
                target?.container?.portProtocol === MW_REGISTRY_PORT_PROTOCOL
            );
        });
    });

    if (!registryIngress) {
        throw new Error(
            "Registry ingress not found. Registry is not exposed via domain."
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