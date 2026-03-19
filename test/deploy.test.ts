import { deployProject } from "../src/orchestration/deploy_project";
import { Duration } from "../src/utils/helpers";
import type { DeployOptions, DeployResult } from "../src/types/index";

// --- Mock all the entities that deployProject depends on
jest.mock("../src/entities/project", () => ({
  getProjectShortIdFromUuid: jest.fn(async () => "test-short-id"),
}));

jest.mock("../src/entities/registry", () => ({
  checkDocker: jest.fn(),
  checkRailpack: jest.fn(),
  setupProjectRegistry: jest.fn(async () => ({
    username: "test-user",
    password: "test-password",
    uri: "registry.test.project.space",
    host: "registry.test.project.space",
    registryServiceId: "registry-service-123",
    registry: { id: "registry-123" },
    created: true,
  })),
  buildDockerImage: jest.fn(async (registryData, repositoryData) => ({
    ...repositoryData,
    imageId: "sha256:test-image-id",
    imageName: "registry.test.project.space/app-image:latest",
  })),
  localDockerPush: jest.fn(async () => undefined),
}));

jest.mock("../src/entities/repository", () => ({
  checkRepository: jest.fn(async () => ({
    buildContext: "/tmp/test-repo",
    ports: ["80:80/tcp"],
    dockerfilePath: "/tmp/test-repo/Dockerfile",
    dockerfileContent: "FROM nginx:alpine",
    dockerfileCreated: false,
    railpackPlanPath: null,
  })),
}));

jest.mock("../src/entities/service", () => ({
  deployService: jest.fn(async () => ({
    serviceName: "app-test-project",
    deployedServiceId: "service-123",
  })),
}));

describe("deployProject integration test", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully build and deploy a project with mocked dependencies", async () => {
    // Prepare test input
    const testProjectId = "test-project-uuid";
    const testTimeout = Duration.fromSeconds(30);

    const options: DeployOptions = {
      projectId: testProjectId,
      apiClient: {} as any, // Mock API client - actual methods are mocked
      waitTimeout: testTimeout,
    };

    // Execute deployProject
    const result: DeployResult = await deployProject(options);

    // Assert the result structure
    expect(result).toBeDefined();
    expect(result.deployedServiceId).toBe("service-123");
    expect(result.serviceName).toBe("app-test-project");

    // Verify that all expected functions were called
    const projectModule = require("../src/entities/project");
    expect(projectModule.getProjectShortIdFromUuid).toHaveBeenCalledWith(
      options.apiClient,
      testProjectId
    );

    const registryModule = require("../src/entities/registry");
    expect(registryModule.checkDocker).toHaveBeenCalled();
    expect(registryModule.checkRailpack).toHaveBeenCalled();
    expect(registryModule.setupProjectRegistry).toHaveBeenCalledWith(
      options.apiClient,
      testProjectId,
      "test-short-id",
      testTimeout
    );
    expect(registryModule.buildDockerImage).toHaveBeenCalled();
    expect(registryModule.localDockerPush).toHaveBeenCalled();

    const repositoryModule = require("../src/entities/repository");
    expect(repositoryModule.checkRepository).toHaveBeenCalled();

    const serviceModule = require("../src/entities/service");
    expect(serviceModule.deployService).toHaveBeenCalledWith(
      options.apiClient,
      testProjectId,
      expect.objectContaining({
        imageName: "registry.test.project.space/app-image:latest",
      }),
      testTimeout
    );
  });

  it("should handle errors from Docker checks", async () => {
    const registryModule = require("../src/entities/registry");
    registryModule.checkDocker.mockRejectedValueOnce(
      new Error("Docker is not installed")
    );

    const testProjectId = "test-project-uuid";
    const options: DeployOptions = {
      projectId: testProjectId,
      apiClient: {} as any,
      waitTimeout: Duration.fromSeconds(30),
    };

    await expect(deployProject(options)).rejects.toThrow(
      "Docker is not installed"
    );
  });

  it("should handle errors from registry setup", async () => {
    const registryModule = require("../src/entities/registry");
    registryModule.setupProjectRegistry.mockRejectedValueOnce(
      new Error("Failed to setup registry")
    );

    const testProjectId = "test-project-uuid";
    const options: DeployOptions = {
      projectId: testProjectId,
      apiClient: {} as any,
      waitTimeout: Duration.fromSeconds(30),
    };

    await expect(deployProject(options)).rejects.toThrow(
      "Failed to setup registry"
    );
  });
});