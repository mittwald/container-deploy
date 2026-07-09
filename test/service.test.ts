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

import { deployServiceAs } from "../src/entities/service";
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

  return {
    serviceId,
    updateStack,
    listServices,
    apiClient: {
      container: {
        updateStack,
        listServices,
        recreateService,
        ...overrides,
      },
    } as any,
  };
}

describe("deployServiceAs volume handling", () => {
  it("passes volume mounts and declares named volumes at the stack level", async () => {
    const { apiClient, updateStack, serviceId } = makeApiClient();

    const result = await deployServiceAs(
      apiClient,
      "project-1",
      "project-registry",
      {
        image: "mittwald/registry:3",
        description: "Project private registry",
        ports: ["5000:5000/tcp"],
        volumes: ["project-registry-data:/var/lib/registry"],
      },
      Duration.fromSeconds(30)
    );

    expect(result).toBe(serviceId);

    const updateArg = updateStack.mock.calls[0][0];
    // The mount spec is forwarded to the service config...
    expect(updateArg.data.services["project-registry"].volumes).toEqual([
      "project-registry-data:/var/lib/registry",
    ]);
    // ...and the named volume is declared at the stack level so it persists.
    expect(updateArg.data.volumes).toEqual({
      "project-registry-data": {},
    });
  });

  it("does not declare stack volumes when no named volume is used", async () => {
    const { apiClient, updateStack } = makeApiClient();

    await deployServiceAs(
      apiClient,
      "project-1",
      "app",
      {
        image: "nginx:alpine",
        description: "app",
        ports: ["80:80/tcp"],
        // A bind mount against the project file system is not a named volume.
        volumes: ["/html:/usr/share/nginx/html"],
      },
      Duration.fromSeconds(30)
    );

    const updateArg = updateStack.mock.calls[0][0];
    expect(updateArg.data.volumes).toBeUndefined();
  });

  it("omits the volumes key entirely when the service has no volumes", async () => {
    const { apiClient, updateStack } = makeApiClient();

    await deployServiceAs(
      apiClient,
      "project-1",
      "app",
      {
        image: "nginx:alpine",
        description: "app",
        ports: ["80:80/tcp"],
      },
      Duration.fromSeconds(30)
    );

    const updateArg = updateStack.mock.calls[0][0];
    expect("volumes" in updateArg.data).toBe(false);
  });
});
