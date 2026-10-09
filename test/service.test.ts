// The @mittwald/api-client package ships ESM-only exports that jest cannot
// resolve, so (like the other suites) we stub it out. deployServiceAs only
// relies on assertStatus, which we make a no-op that enforces the status code.
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

import { deployService, deployServiceAs } from "../src/entities/service";
import { Duration } from "../src/utils/helpers";

// The @mittwald/api-client's assertStatus is a no-op for our mocked responses
// as long as the status matches, so we build a minimal fake API client that
// returns the shapes deployServiceAs expects.
function makeApiClient(overrides: Record<string, jest.Mock> = {}) {
  const serviceId = "svc-123";

  // Echo back a running service for whatever service name was requested, so a
  // single fixture works regardless of the service under test.
  const servicesFor = (data: any) =>
    Object.keys(data.services).map(serviceName => ({
      id: serviceId,
      serviceName,
      status: "running",
    }));

  let lastServices: any[] = [];

  const updateStack = jest.fn(async ({ data }: any) => {
    lastServices = servicesFor(data);
    return { status: 200, data: { services: lastServices } };
  });

  const listServices = jest.fn(async () => ({
    status: 200,
    data: lastServices,
  }));

  const recreateService = jest.fn(async () => ({ status: 204 }));
  const getStack = jest.fn(async () => ({ status: 200, data: { services: [] } }));

  return {
    serviceId,
    updateStack,
    listServices,
    recreateService,
    getStack,
    apiClient: {
      container: {
        updateStack,
        listServices,
        recreateService,
        getStack,
        ...overrides,
      },
    } as any,
  };
}

describe("deployServiceAs volume handling", () => {
  it("mounts named volumes on the service and declares them at the stack level", async () => {
    const { apiClient, updateStack, serviceId } = makeApiClient();

    const result = await deployServiceAs(
      apiClient,
      "project-1",
      "stack-1",
      "project-registry",
      {
        image: "mittwald/registry:3",
        description: "Project private registry",
        ports: ["5000:5000/tcp"],
        volumes: [
          { name: "project-registry-data", mountPath: "/var/lib/registry" },
        ],
      },
      Duration.fromSeconds(30)
    );

    expect(result).toBe(serviceId);

    const updateArg = updateStack.mock.calls[0][0];
    expect(updateArg.stackId).toBe("stack-1");
    // The mount is rendered into the API's `<volume>:<mountpoint>` format...
    expect(updateArg.data.services["project-registry"].volumes).toEqual([
      "project-registry-data:/var/lib/registry",
    ]);
    // ...and declared at the stack level, which is what actually creates it.
    expect(updateArg.data.volumes).toEqual({
      "project-registry-data": { name: "project-registry-data" },
    });
  });

  it("sends empty volumes when the service has none", async () => {
    const { apiClient, updateStack } = makeApiClient();

    await deployServiceAs(
      apiClient,
      "project-1",
      "stack-1",
      "app",
      {
        image: "nginx:alpine",
        description: "app",
        ports: ["80:80/tcp"],
      },
      Duration.fromSeconds(30)
    );

    const updateArg = updateStack.mock.calls[0][0];
    expect(updateArg.data.services["app"].volumes).toEqual([]);
    expect(updateArg.data.volumes).toEqual({});
  });
});

describe.each(["standard", "named"])("%s service stack targeting", deployment => {
  const deploy = (apiClient: any) => deployment === "standard"
    ? deployService(
        apiClient,
        "project-1",
        "stack-1",
        { buildContext: ".", imageName: "nginx:alpine", ports: ["80:80/tcp"] },
        Duration.fromSeconds(1),
        undefined,
        "app",
      )
    : deployServiceAs(
        apiClient,
        "project-1",
        "stack-1",
        "app",
        { image: "nginx:alpine", description: "app", ports: ["80:80/tcp"] },
        Duration.fromSeconds(1),
      );

  afterEach(() => {
    jest.useRealTimers();
  });

  it("updates and polls the selected service despite duplicate names in other stacks", async () => {
    const listServices = jest.fn(async () => ({
      status: 200,
      data: [
        { id: "other-service", serviceName: "app", status: "stopped" },
        { id: "svc-123", serviceName: "app", status: "running" },
      ],
    }));
    const { apiClient, updateStack, getStack, recreateService } = makeApiClient({ listServices });

    const result = await deploy(apiClient);

    expect(deployment === "standard" ? (result as any).deployedServiceId : result).toBe("svc-123");
    expect(updateStack).toHaveBeenCalledWith(expect.objectContaining({ stackId: "stack-1" }));
    expect(listServices).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(recreateService).not.toHaveBeenCalled();
    if (deployment === "standard") {
      expect(getStack).toHaveBeenCalledWith({ stackId: "stack-1" });
    }
  });

  it("recreates only the service in the selected stack", async () => {
    const getStack = jest.fn(async () => ({
      status: 200,
      data: { services: [{ id: "svc-123", serviceName: "app" }] },
    }));
    const listServices = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        data: [
          { id: "other-service", serviceName: "app", status: "running" },
          { id: "svc-123", serviceName: "app", status: deployment === "standard" ? "running" : "stopped" },
        ],
      })
      .mockResolvedValue({ status: 200, data: [{ id: "svc-123", serviceName: "app", status: "running" }] });
    const { apiClient, recreateService } = makeApiClient({ getStack, listServices });

    await deploy(apiClient);

    expect(recreateService).toHaveBeenCalledWith({ stackId: "stack-1", serviceId: "svc-123" });
  });

  it("does not treat a running same-named service in another stack as ready", async () => {
    jest.useFakeTimers();
    const listServices = jest.fn(async () => ({
      status: 200,
      data: [
        { id: "other-service", serviceName: "app", status: "running" },
        { id: "svc-123", serviceName: "app", status: "stopped" },
      ],
    }));
    const { apiClient } = makeApiClient({ listServices });

    const assertion = expect(deploy(apiClient)).rejects.toThrow("expected condition was not reached");
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
