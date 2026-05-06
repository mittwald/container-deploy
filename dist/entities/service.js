/*
    Helper module to manage project services,
    mostly spin up services from give image and meta data
*/
import { assertStatus, } from "@mittwald/api-client";
import { waitUntil, } from "../utils/helpers.js";
export async function deployService(apiClient, projectId, repositoryData, timeout, environment) {
    let existing = false;
    const serviceName = `app-${projectId}`;
    const servicesResp = await apiClient.container.listServices({
        projectId,
    });
    assertStatus(servicesResp, 200);
    const appService = servicesResp.data.find(svc => svc.serviceName === serviceName);
    if (appService) {
        existing = true;
    }
    const stackId = projectId;
    let deployedServiceId = "";
    const serviceRequest = {
        image: repositoryData.imageName,
        description: "Deployed application",
        ports: repositoryData.ports,
        environment: {
            PORT: "80", // XXX: nothing clever, just match fallback so target is correctly set in the ingress.
            ...environment,
        },
    };
    const updateResp = await apiClient.container.updateStack({
        stackId,
        data: {
            services: {
                [serviceName]: serviceRequest
            }
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
            const deployedSvc = services.find(svc => svc.serviceName === serviceName);
            if (!deployedSvc) {
                return null;
            }
            if (deployedSvc.status === "running") {
                deployedServiceId = deployedSvc.id;
                return true;
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }, timeout);
    return {
        deployedServiceId,
        serviceName,
    };
}
/**
 * Generic service deployment function.
 * Deploys a service with given configuration to a project stack.
 * Returns the deployed service ID after it transitions to "running" state.
 *
 * @param apiClient The Mittwald API client instance
 * @param projectId The project ID (used as stack ID)
 * @param serviceName The name of the service to deploy
 * @param serviceConfig Service configuration (image, description, environment, ports)
 * @param timeout Maximum time to wait for the service to be running
 * @returns The ID of the deployed service
 */
export async function deployServiceAs(apiClient, projectId, serviceName, serviceConfig, timeout) {
    const stackId = projectId;
    let deployedServiceId = "";
    // Update stack with the new service
    const updateResp = await apiClient.container.updateStack({
        stackId,
        data: {
            services: {
                [serviceName]: serviceConfig,
            },
        },
    });
    assertStatus(updateResp, 200);
    const services = updateResp.data.services;
    if (!services) {
        throw new Error("Failed to update services");
    }
    const service = services.find(svc => svc.serviceName === serviceName);
    if (!service) {
        throw new Error(`Failed to deploy service ${serviceName}: Service not found in response`);
    }
    const serviceId = service.id;
    // Check if service already existed and needs recreation
    const allServicesResp = await apiClient.container.listServices({
        projectId,
    });
    assertStatus(allServicesResp, 200);
    const existingService = allServicesResp.data.find(svc => svc.serviceName === serviceName);
    if (existingService && existingService.status !== "running") {
        // Recreate the service if it was stopped
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
            const deployedSvc = servicesResp.data.find(svc => svc.serviceName === serviceName);
            if (!deployedSvc) {
                return null;
            }
            if (deployedSvc.status === "running") {
                deployedServiceId = deployedSvc.id;
                return true;
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }, timeout);
    return deployedServiceId;
}
//# sourceMappingURL=service.js.map