jest.mock(
  "@mittwald/api-client",
  () => ({
    MittwaldAPIV2Client: class {},
    assertStatus: (resp: { status: number }, expected: number) => {
      if (resp.status !== expected) {
        throw new Error(`Expected status ${expected}, got ${resp.status}`);
      }
    },
  }),
  { virtual: true }
);

jest.mock("../src/entities/service", () => ({
  deployServiceAs: jest.fn(async () => "registry-service"),
}));

jest.mock("../src/entities/domain", () => ({
  createAndWaitForDomain: jest.fn(async () => ({ id: "ingress-1" })),
  waitForDomainReachability: jest.fn(async () => true),
}));

import { checkProjectRegistry } from "../src/entities/registry";
import { deployServiceAs } from "../src/entities/service";
import { createAndWaitForDomain } from "../src/entities/domain";
import { setupProjectRegistry } from "../src/orchestration/registry_setup";
import { Duration } from "../src/utils/helpers";

function makeApiClient() {
  const registry = { id: "registry-1", uri: "registry.p-test.project.space" };
  const apiClient = {
    container: {
      listRegistries: jest.fn(async () => ({ status: 200, data: [registry] })),
      getStack: jest.fn(async () => ({
        status: 200,
        data: { services: [{ id: "registry-service", serviceName: "project-registry" }] },
      })),
      listServices: jest.fn(async () => ({
        status: 200,
        data: [{ id: "wrong-stack-service", serviceName: "project-registry" }],
      })),
      getService: jest.fn(async () => ({
        status: 200,
        data: { deployedState: { envs: { REGISTRY_USER: "user", REGISTRY_PASSWORD: "password" } } },
      })),
      createRegistry: jest.fn(async () => ({ status: 201, data: registry })),
    },
    axios: {
      get: jest.fn(async () => ({
        status: 200,
        data: [{ paths: [{ target: { container: { id: "registry-service", portProtocol: "5000/tcp" } } }] }],
      })),
    },
  };
  return { apiClient, registry };
}

describe("registry stack targeting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads credentials from the selected stack while keeping ingress lookup project-scoped", async () => {
    const { apiClient, registry } = makeApiClient();

    const result = await checkProjectRegistry(apiClient as any, "project-1", "stack-1", registry as any);

    expect(result.registryServiceId).toBe("registry-service");
    expect(result.username).toBe("user");
    expect(apiClient.container.getStack).toHaveBeenCalledWith({ stackId: "stack-1" });
    expect(apiClient.container.getService).toHaveBeenCalledWith({
      stackId: "stack-1",
      serviceId: "registry-service",
    });
    expect(apiClient.container.listServices).not.toHaveBeenCalled();
    expect(apiClient.axios.get).toHaveBeenCalledWith("/v2/projects/project-1/ingresses");
  });

  it("does not fall back to another stack when the registry service is missing", async () => {
    const { apiClient, registry } = makeApiClient();
    apiClient.container.getStack.mockResolvedValueOnce({ status: 200, data: { services: [] } });

    await expect(checkProjectRegistry(apiClient as any, "project-1", "stack-1", registry as any))
      .rejects.toThrow("Registry service not found");

    expect(apiClient.container.getService).not.toHaveBeenCalled();
  });

  it("forwards the selected stack when reusing an existing registry", async () => {
    const { apiClient } = makeApiClient();

    const result = await setupProjectRegistry(apiClient as any, "project-1", "stack-1", "p-test", Duration.fromSeconds(30));

    expect(result.created).toBe(false);
    expect(apiClient.container.listRegistries).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(apiClient.container.getService).toHaveBeenCalledWith({ stackId: "stack-1", serviceId: "registry-service" });
    expect(deployServiceAs).not.toHaveBeenCalled();
  });

  it("deploys a new registry into the selected stack and registers it with the project", async () => {
    jest.useFakeTimers();
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({ status: 200, data: [] });
    const timeout = Duration.fromSeconds(30);

    const resultPromise = setupProjectRegistry(apiClient as any, "project-1", "stack-1", "p-test", timeout);
    await jest.advanceTimersByTimeAsync(120000);
    const result = await resultPromise;

    expect(result.created).toBe(true);
    expect(deployServiceAs).toHaveBeenCalledWith(
      apiClient,
      "project-1",
      "stack-1",
      "project-registry",
      expect.objectContaining({ image: "mittwald/registry:3" }),
      timeout,
    );
    expect(createAndWaitForDomain).toHaveBeenCalledWith(
      apiClient, "project-1", "registry.p-test.project.space", "registry-service", "5000/tcp", timeout,
    );
    expect(apiClient.container.createRegistry).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1" }));
  });
});