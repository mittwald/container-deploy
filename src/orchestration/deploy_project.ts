import { setupProjectRegistry } from "../entities/registry";
import { checkRepository, buildDockerImage, localDockerPush } from "../entities/repository";
import { deployService } from "../entities/service";
import { getProjectShortIdFromUuid } from "../entities/project";
import type { DeployOptions, DeployResult } from "../types";

export async function deployProject(opts: DeployOptions): Promise<DeployResult> {
  // No renderer/progress here: pure logic and structured result/errors

  const projectShortId = await getProjectShortIdFromUuid(opts.apiClient, opts.projectId);

  await checkDocker();
  await checkRailpack();

  const registryData = await setupProjectRegistry(
    opts.apiClient,
    opts.projectId,
    projectShortId,
    opts.waitTimeout,
  );

  let repositoryData = await checkRepository();
  repositoryData = await buildDockerImage(registryData, repositoryData);
  await localDockerPush(repositoryData, registryData);

  const deployRes = await deployService(
    opts.apiClient,
    opts.projectId,
    repositoryData,
    opts.waitTimeout,
  );

  return { deployedServiceId: deployRes.deployedServiceId, serviceName: deployRes.serviceName };
}