/*
    Helper module to manage project services,
    mostly spin up services from give image and meta data
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
    DeployRes,
    NamedVolumeMount,
    RepositoryData
} from "../types/index.js";


const DEFAULT_CONTAINER_PORT = "80";

/**
 * Returns the container port of a port mapping, e.g. "3000" for
 * "8080:3000/tcp", "3000/tcp" or "127.0.0.1:8080:3000".
 * Returns undefined if the mapping cannot be parsed.
 */
export function containerPortOf(portMapping: string): string | undefined {
    const withoutProtocol = portMapping.trim().split("/")[0];
    const containerPort = withoutProtocol.split(":").pop() ?? "";
    if (!/^\d+$/.test(containerPort)) {
        return undefined;
    }

    const port = parseInt(containerPort, 10);
    if (port < 1 || port > 65535) {
        return undefined;
    }

    return String(port);
}

/**
 * Returns the default value for the PORT environment variable: the container
 * port of the primary (first) port mapping, or "80" if there is none.
 */
export function defaultPortEnv(ports?: string[]): string {
    const primary = ports?.[0];
    return (primary && containerPortOf(primary)) || DEFAULT_CONTAINER_PORT;
}

export async function deployService(apiClient: MittwaldAPIV2Client,
                                    projectId: string,
                                    stackId: string,
                                    repositoryData: RepositoryData,
                                    timeout: Duration,
                                    environment?: Record<string, string>,
                                    serviceName?: string,
                                    volumes?: Record<string, string>) {

    let existing: boolean = false;
    serviceName = serviceName || `app-${projectId}`;
    const stackResp = await apiClient.container.getStack({
        stackId,
    });
    assertStatus(stackResp, 200);

    const appService = stackResp.data.services?.find(
        svc => svc.serviceName === serviceName
    );

    if (appService) {
        existing = true;
    }

    let deployedServiceId: string = "";

    const volumeEntries = Object.entries(volumes ?? {});

    const serviceRequest = {
        image: repositoryData.imageName!,
        description: "Deployed application",
        ports: repositoryData.ports,
        environment: {
            PORT: defaultPortEnv(repositoryData.ports),
            ...environment,
        },
        volumes: volumeEntries.map(([name, mountPath]) => `${name}:${mountPath}`),
    };

    const updateResp = await apiClient.container.updateStack({
        stackId,
        data: {
            services: {
                [serviceName]: serviceRequest
            },
            volumes: Object.fromEntries(volumeEntries.map(([name]) => [name, {}])),
        },
    });
    assertStatus(updateResp, 200);

    const services = updateResp.data.services;
    if (!services) {
        throw new Error("Failed to update services");
    }

    const service = services.find(svc => svc.serviceName === serviceName);
    if (!service) {
        throw new Error("Failed to deploy service: Service not found in response");
    }

    const serviceId = service.id;
    if (existing) {
        const recreateResp = await apiClient.container.recreateService({
            stackId,
            serviceId,
        });
        assertStatus(recreateResp, 204);
    }

    await waitUntil(async () => {
        try {
            const servicesResp = await apiClient.container.listServices({
                projectId,
            });
            assertStatus(servicesResp, 200);
            const services = servicesResp.data;

            const deployedSvc = services.find(
                svc => svc.id === serviceId
            );

            if (!deployedSvc) {
                return null;
            }

            if (deployedSvc.status === "running") {
                deployedServiceId = deployedSvc.id;
                return true;
            }
            return null;
        } catch (error) {
            return null;
        }
    }, timeout);

    return {
        deployedServiceId,
        serviceName,
    } as DeployRes;
}

/**
 * Generic service deployment function.
 * Deploys a service with given configuration to a project stack.
 * Recreates it when the update response indicates this is required.
 * Returns the deployed service ID after it transitions to "running" state.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID containing the stack
 * @param stackId The ID of the existing stack to deploy to
 * @param serviceName The name of the service to deploy
 * @param serviceConfig Service configuration (image, description, environment, ports, volumes)
 * @param timeout Maximum time to wait for the service to be running
 * @returns The ID of the deployed service
 */
export async function deployServiceAs(
    apiClient: MittwaldAPIV2Client,
    projectId: string,
    stackId: string,
    serviceName: string,
    serviceConfig: {
        image: string;
        description: string;
        environment?: Record<string, string>;
        ports: string[];
        volumes?: NamedVolumeMount[];
    },
    timeout: Duration,
): Promise<string> {
    let deployedServiceId: string = "";

    const { volumes = [], ...serviceRequest } = serviceConfig;

    // Volumes go in two places: the mount specs on the service, and the stack
    // level, which is what actually creates the volume.
    const updateResp = await apiClient.container.updateStack({
        stackId,
        data: {
            services: {
                [serviceName]: {
                    ...serviceRequest,
                    volumes: volumes.map(v => `${v.name}:${v.mountPath}`),
                },
            },
            volumes: Object.fromEntries(volumes.map(v => [v.name, {name: v.name}])),
        },
    });
    assertStatus(updateResp, 200);

    const services = updateResp.data.services;
    if (!services) {
        throw new Error("Failed to update services");
    }

    const service = services.find(svc => svc.serviceName === serviceName);
    if (!service) {
        throw new Error(
            `Failed to deploy service ${serviceName}: Service not found in response`
        );
    }

    const serviceId = service.id;

    if (service.requiresRecreate) {
        const recreateResp = await apiClient.container.recreateService({
            stackId,
            serviceId,
        });
        assertStatus(recreateResp, 204);
    }

    // Wait for service to be running
    await waitUntil(async () => {
        try {
            const servicesResp = await apiClient.container.listServices({
                projectId,
            });
            assertStatus(servicesResp, 200);

            const deployedSvc = servicesResp.data.find(
                svc => svc.id === serviceId
            );

            if (!deployedSvc) {
                return null;
            }

            if (deployedSvc.status === "running") {
                deployedServiceId = deployedSvc.id;
                return true;
            }

            return null;
        } catch (error) {
            return null;
        }
    }, timeout);

    return deployedServiceId;
}
