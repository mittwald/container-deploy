jest.mock(
  "@mittwald/api-client",
  () => ({
    MittwaldAPIV2Client: class {},
    // Like the real assertStatus, the thrown error carries the response
    assertStatus: (resp: { status: number }, expected: number) => {
      if (resp.status !== expected) {
        throw Object.assign(new Error(`Expected status ${expected}, got ${resp.status}`), { response: resp });
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
  findDefaultDomain: jest.fn(),
  findDomainByHostname: jest.fn(),
  waitForDomainReachability: jest.fn(async () => true),
}));

import { checkProjectRegistry, getProjectRegistry } from "../src/entities/registry";
import { deployServiceAs } from "../src/entities/service";
import {
  createAndWaitForDomain,
  findDefaultDomain,
  findDomainByHostname,
  waitForDomainReachability,
} from "../src/entities/domain";
import { setupProjectRegistry } from "../src/orchestration/registry_setup";
import { Duration } from "../src/utils/helpers";

const defaultIngress = { id: "default-ingress", hostname: "p-test.project.space", isDefault: true };

const registryIngress = {
  id: "ingress-1",
  hostname: "registry.p-test.project.space",
  paths: [{ path: "/", target: { container: { id: "registry-service", portProtocol: "5000/tcp" } } }],
};

function makeApiClient() {
  const registry = { id: "registry-1", uri: "registry.p-test.project.space" };
  const apiClient = {
    container: {
      listRegistries: jest.fn(async () => ({ status: 200, data: [registry] as any[] })),
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
      updateRegistry: jest.fn(async () => ({ status: 204, data: {} })),
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

const registryNotReachableResponse = {
  status: 400,
  data: {
    type: "ValidationError",
    message: "3 INVALID_ARGUMENT: registry uri 'registry.p-test.project.space' does not host a registry",
  },
} as any;

async function runSetup(apiClient: any, timeout = Duration.fromSeconds(30)) {
  jest.useFakeTimers();
  const resultPromise = setupProjectRegistry(apiClient, "project-1", "stack-1", "p-test", timeout);
  await jest.advanceTimersByTimeAsync(120000);
  return resultPromise;
}

describe("registry stack targeting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (findDefaultDomain as jest.Mock).mockResolvedValue(defaultIngress);
    (findDomainByHostname as jest.Mock).mockResolvedValue(registryIngress);
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

    const result = await runSetup(apiClient);

    expect(result.created).toBe(false);
    expect(apiClient.container.listRegistries).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(apiClient.container.getService).toHaveBeenCalledWith({ stackId: "stack-1", serviceId: "registry-service" });
    expect(deployServiceAs).not.toHaveBeenCalled();
    expect(createAndWaitForDomain).not.toHaveBeenCalled();
    expect(waitForDomainReachability).not.toHaveBeenCalled();
  });

  it("deploys a new registry into the selected stack and registers it with the project", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({ status: 200, data: [] });
    apiClient.container.getStack.mockResolvedValueOnce({ status: 200, data: { services: [] } });
    (findDomainByHostname as jest.Mock).mockResolvedValueOnce(null);
    const timeout = Duration.fromSeconds(30);

    const result = await runSetup(apiClient, timeout);

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

describe("registry reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (findDefaultDomain as jest.Mock).mockResolvedValue(defaultIngress);
    (findDomainByHostname as jest.Mock).mockResolvedValue(registryIngress);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("always sets the record credentials from the service environment", async () => {
    const { apiClient } = makeApiClient();

    const result = await runSetup(apiClient);

    expect(result).toMatchObject({ username: "user", password: "password", created: false });
    expect(apiClient.container.updateRegistry).toHaveBeenCalledWith({
      registryId: "registry-1",
      data: { credentials: { username: "user", password: "password" } },
    });
    expect(apiClient.container.createRegistry).not.toHaveBeenCalled();
  });

  it("re-deploys a missing service and updates the existing record with the new credentials", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.getStack.mockResolvedValueOnce({ status: 200, data: { services: [] } });

    const result = await runSetup(apiClient);

    expect(deployServiceAs).toHaveBeenCalledTimes(1);
    const env = (deployServiceAs as jest.Mock).mock.calls[0][4].environment;
    expect(result).toMatchObject({ username: env.REGISTRY_USER, password: env.REGISTRY_PASSWORD, created: false });
    expect(apiClient.container.updateRegistry).toHaveBeenCalledWith({
      registryId: "registry-1",
      data: { credentials: { username: env.REGISTRY_USER, password: env.REGISTRY_PASSWORD } },
    });
    expect(apiClient.container.createRegistry).not.toHaveBeenCalled();
    expect(waitForDomainReachability).toHaveBeenCalledWith("registry.p-test.project.space", expect.anything());
  });

  it("creates a missing ingress without re-deploying the service", async () => {
    const { apiClient } = makeApiClient();
    (findDomainByHostname as jest.Mock).mockResolvedValueOnce(null);

    await runSetup(apiClient);

    expect(deployServiceAs).not.toHaveBeenCalled();
    expect(createAndWaitForDomain).toHaveBeenCalledWith(
      apiClient, "project-1", "registry.p-test.project.space", "registry-service", "5000/tcp", expect.anything(),
    );
  });

  it("re-targets an ingress that does not route to the registry service", async () => {
    const { apiClient } = makeApiClient();
    (findDomainByHostname as jest.Mock).mockResolvedValueOnce({
      ...registryIngress,
      paths: [{ path: "/", target: { container: { id: "deleted-service", portProtocol: "5000/tcp" } } }],
    });

    await runSetup(apiClient);

    expect(createAndWaitForDomain).toHaveBeenCalledWith(
      apiClient, "project-1", "registry.p-test.project.space", "registry-service", "5000/tcp", expect.anything(),
    );
  });

  it("keeps the credentials of an existing service when the record is missing", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({ status: 200, data: [] });

    const result = await runSetup(apiClient);

    expect(result.created).toBe(true);
    expect(deployServiceAs).not.toHaveBeenCalled();
    expect(apiClient.container.createRegistry).toHaveBeenCalledWith({
      projectId: "project-1",
      data: expect.objectContaining({
        uri: "registry.p-test.project.space",
        credentials: { username: "user", password: "password" },
      }),
    });
  });

  it("ignores unrelated registries configured in the project", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({
      status: 200,
      data: [{ id: "quay", uri: "quay.io" }, { id: "external", uri: "registry.example.com" }],
    });

    const result = await runSetup(apiClient);

    expect(result.created).toBe(true);
    expect(apiClient.container.updateRegistry).not.toHaveBeenCalled();
    expect(apiClient.container.createRegistry).toHaveBeenCalledTimes(1);
  });

  it("derives the registry hostname from the project's default domain", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({ status: 200, data: [] });
    (findDefaultDomain as jest.Mock).mockResolvedValueOnce({ ...defaultIngress, hostname: "p-test.example.net" });
    (findDomainByHostname as jest.Mock).mockResolvedValueOnce(null);

    const result = await runSetup(apiClient);

    expect(result.uri).toBe("registry.p-test.example.net");
    expect(findDefaultDomain).toHaveBeenCalledWith(apiClient, "project-1");
    expect(createAndWaitForDomain).toHaveBeenCalledWith(
      apiClient, "project-1", "registry.p-test.example.net", "registry-service", "5000/tcp", expect.anything(),
    );
    expect(apiClient.container.createRegistry).toHaveBeenCalledWith({
      projectId: "project-1",
      data: expect.objectContaining({ uri: "registry.p-test.example.net" }),
    });
  });
});

describe("registry URI propagation", () => {
  const retargetedIngress = {
    ...registryIngress,
    paths: [{ path: "/", target: { container: { id: "deleted-service", portProtocol: "5000/tcp" } } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (findDefaultDomain as jest.Mock).mockResolvedValue(defaultIngress);
    (findDomainByHostname as jest.Mock).mockResolvedValue(registryIngress);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retries the credential update until the API can reach a re-targeted registry", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.getStack.mockResolvedValueOnce({ status: 200, data: { services: [] } });
    (findDomainByHostname as jest.Mock).mockResolvedValueOnce(retargetedIngress);
    apiClient.container.updateRegistry
      .mockResolvedValueOnce(registryNotReachableResponse)
      .mockResolvedValueOnce(registryNotReachableResponse);

    const result = await runSetup(apiClient);

    expect(result.created).toBe(false);
    expect(apiClient.container.updateRegistry).toHaveBeenCalledTimes(3);
  });

  it("retries the record creation until the API can reach a new registry", async () => {
    const { apiClient, registry } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({ status: 200, data: [] });
    (findDomainByHostname as jest.Mock).mockResolvedValueOnce(null);
    apiClient.container.createRegistry.mockResolvedValueOnce(registryNotReachableResponse);

    const result = await runSetup(apiClient);

    expect(result).toMatchObject({ created: true, registry });
    expect(apiClient.container.createRegistry).toHaveBeenCalledTimes(2);
  });

  it("does not wait a fixed time after creating a new ingress", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({ status: 200, data: [] });
    (findDomainByHostname as jest.Mock).mockResolvedValueOnce(null);
    jest.useFakeTimers();

    // Resolves without advancing the fake timers
    const result = await setupProjectRegistry(apiClient as any, "project-1", "stack-1", "p-test", Duration.fromSeconds(30));

    expect(result.created).toBe(true);
    expect(createAndWaitForDomain).toHaveBeenCalledTimes(1);
  });

  it("gives up when the API cannot reach the registry within the timeout", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.updateRegistry.mockResolvedValue(registryNotReachableResponse);
    jest.useFakeTimers();

    const resultPromise = setupProjectRegistry(apiClient as any, "project-1", "stack-1", "p-test", Duration.fromSeconds(30));
    const assertion = expect(resultPromise).rejects.toThrow("Expected status 204, got 400");
    await jest.advanceTimersByTimeAsync(120000);
    await assertion;

    // attempts after 0s, 10s, 20s and 30s
    expect(apiClient.container.updateRegistry).toHaveBeenCalledTimes(4);
  });

  it("does not retry on other API errors", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.updateRegistry.mockResolvedValue({
      status: 400,
      data: { type: "ValidationError", message: "invalid credentials" },
    } as any);
    jest.useFakeTimers();

    const resultPromise = setupProjectRegistry(apiClient as any, "project-1", "stack-1", "p-test", Duration.fromSeconds(30));
    const assertion = expect(resultPromise).rejects.toThrow("Expected status 204, got 400");
    await jest.advanceTimersByTimeAsync(120000);
    await assertion;

    expect(apiClient.container.updateRegistry).toHaveBeenCalledTimes(1);
  });
});

describe("getProjectRegistry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (findDefaultDomain as jest.Mock).mockResolvedValue(defaultIngress);
  });

  it("identifies the project registry by its URI", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({
      status: 200,
      data: [
        { id: "quay", uri: "quay.io" },
        { id: "other-project", uri: "registry.p-other.project.space" },
        { id: "registry-1", uri: "registry.p-test.project.space" },
      ],
    });

    const registry = await getProjectRegistry(apiClient as any, "project-1");

    expect(registry?.id).toBe("registry-1");
    expect(findDefaultDomain).toHaveBeenCalledWith(apiClient, "project-1");
  });

  it("returns undefined when only unrelated registries exist", async () => {
    const { apiClient } = makeApiClient();
    apiClient.container.listRegistries.mockResolvedValueOnce({
      status: 200,
      data: [{ id: "docker", uri: "docker.io" }, { id: "quay", uri: "quay.io" }],
    });

    const registry = await getProjectRegistry(apiClient as any, "project-1");

    expect(registry).toBeUndefined();
  });
});

describe("findDefaultDomain", () => {
  const { findDefaultDomain: realFindDefaultDomain } = jest.requireActual("../src/entities/domain");

  it("returns the ingress marked as default", async () => {
    const { apiClient } = makeApiClient();
    apiClient.axios.get.mockResolvedValueOnce({
      status: 200,
      data: [registryIngress, defaultIngress],
    });

    const domain = await realFindDefaultDomain(apiClient, "project-1");

    expect(domain.hostname).toBe("p-test.project.space");
    expect(apiClient.axios.get).toHaveBeenCalledWith("/v2/projects/project-1/ingresses");
  });

  it("throws when the project has no default ingress", async () => {
    const { apiClient } = makeApiClient();
    apiClient.axios.get.mockResolvedValueOnce({ status: 200, data: [registryIngress] });

    await expect(realFindDefaultDomain(apiClient, "project-1")).rejects.toThrow("has no default domain");
  });
});
