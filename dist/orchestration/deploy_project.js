import { setupProjectRegistry, } from "./registry_setup.js";
import { checkRequiredTools, buildDockerImage, localDockerPush, } from "../entities/docker.js";
import { checkRepository } from "../entities/repository.js";
import { deployService } from "../entities/service.js";
import { getProjectShortIdFromUuid } from "../entities/project.js";
export async function deployProject(opts) {
    const registryStackId = opts.registryStackId ?? opts.stackId;
    const applicationStackId = opts.applicationStackId ?? opts.stackId;
    if (!registryStackId || !applicationStackId) {
        throw new Error("Provide stackId or both registryStackId and applicationStackId.");
    }
    const projectShortId = await getProjectShortIdFromUuid(opts.apiClient, opts.projectId);
    checkRequiredTools();
    const registryData = await setupProjectRegistry(opts.apiClient, opts.projectId, registryStackId, projectShortId, opts.waitTimeout);
    let repositoryData = await checkRepository(opts.environment);
    repositoryData = await buildDockerImage(registryData, repositoryData, {
        name: opts.imageName,
        tag: opts.imageTag,
    });
    await localDockerPush(repositoryData, registryData);
    const deployRes = await deployService(opts.apiClient, opts.projectId, applicationStackId, repositoryData, opts.waitTimeout, opts.environment, opts.serviceName, opts.volumes);
    return { deployedServiceId: deployRes.deployedServiceId, serviceName: deployRes.serviceName };
}
//# sourceMappingURL=deploy_project.js.map