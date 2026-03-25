import {
    Duration,
} from "../utils/helpers.js";
import { MittwaldAPIV2Client } from "@mittwald/api-client";

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
    host?: string;
    registryServiceId: string;
    registry: any;
    created?: boolean;
};

export type DeployResult = {
    deployedServiceId: string;
    serviceName: string;
};

export type DeployOptions = {
    apiClient: MittwaldAPIV2Client;
    projectId: string;
    waitTimeout: Duration;
};

export type DomainData = {
    id: string;
    hostname?: string;
    [key: string]: any;
};

export type DomainCreateOptions = {
    apiClient: MittwaldAPIV2Client;
    projectId: string;
    hostname: string;
    serviceId: string;
    portProtocol?: string;
    timeout?: Duration;
};