import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { Duration } from "../utils/helpers.js";
import type { RegistryData } from "../types/index.js";
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
export declare function setupProjectRegistry(apiClient: MittwaldAPIV2Client, projectId: string, projectShortId: string, timeout: Duration): Promise<RegistryData>;
//# sourceMappingURL=registry_setup.d.ts.map