import { setupProjectRegistry, } from "./registry_setup.js";
import { checkDocker, checkRailpack, buildDockerImage, localDockerPush, } from "../entities/docker.js";
import { checkRepository } from "../entities/repository.js";
import { deployService } from "../entities/service.js";
import { getProjectShortIdFromUuid } from "../entities/project.js";
export async function deployProject(opts) {
    const projectShortId = await getProjectShortIdFromUuid(opts.apiClient, opts.projectId);
    await checkDocker();
    await checkRailpack();
    const registryData = await setupProjectRegistry(opts.apiClient, opts.projectId, projectShortId, opts.waitTimeout);
    let repositoryData = await checkRepository();
    repositoryData = await buildDockerImage(registryData, repositoryData);
    await localDockerPush(repositoryData, registryData);
    const deployRes = await deployService(opts.apiClient, opts.projectId, repositoryData, opts.waitTimeout, opts.environment);
    return { deployedServiceId: deployRes.deployedServiceId, serviceName: deployRes.serviceName };
}
//# sourceMappingURL=deploy_project.js.map