import {
    Duration,
} from "../utils/helpers.js";

export type RepositoryData = {
  buildContext: string;
  ports: string[];
  dockerfilePath?: string;
  dockerfileContent?: string;
  dockerfileCreated?: boolean;
  imageId?: string;
  imageName?: string;
  railpackPlanPath?: string | null;
};

export type DeployRes = {
    serviceName: string;
    deployedServiceId: string;
};

export type RegistryData = {
    username: string;
    password: string;
    uri: string;
    host: string;
    registryServiceId: string;
    registry: any;
    created?: boolean;
};

export type DeployResult = {
    deployedServiceId: string;
    serviceName: string;
};

export type DeployOptions = {
    apiClient: any;
    projectId: string;
    waitTimeout: Duration;
};