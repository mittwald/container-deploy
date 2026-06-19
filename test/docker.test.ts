import { spawnSync } from "child_process";

import {
  buildDockerImage,
  DEFAULT_IMAGE_NAME,
  DEFAULT_IMAGE_TAG,
} from "../src/entities/docker";
import type { RegistryData, RepositoryData } from "../src/types/index";

jest.mock("child_process", () => ({
  spawnSync: jest.fn(),
  execSync: jest.fn(),
}));

const spawnSyncMock = spawnSync as jest.MockedFunction<typeof spawnSync>;

// Simulate a successful build followed by a successful `docker inspect`
// returning a fake image ID.
function mockSuccessfulBuild() {
  spawnSyncMock.mockImplementation((_cmd, args) => {
    const argv = (args as string[]) ?? [];
    if (argv.includes("inspect")) {
      return { status: 0, stdout: "sha256:test-id\n", stderr: "" } as any;
    }
    return { status: 0, stdout: "", stderr: "" } as any;
  });
}

// Extracts the `-t <imageName>` argument from the build invocation.
function getBuiltImageName(): string | undefined {
  for (const call of spawnSyncMock.mock.calls) {
    const argv = (call[1] as string[]) ?? [];
    const tagIndex = argv.indexOf("-t");
    if (tagIndex !== -1) {
      return argv[tagIndex + 1];
    }
  }
  return undefined;
}

const registryData: RegistryData = {
  username: "user",
  password: "pass",
  uri: "registry.test.project.space",
  registryServiceId: "registry-123",
  registry: {},
};

function makeRepositoryData(): RepositoryData {
  return {
    buildContext: "/tmp/test-repo",
    ports: ["80:80/tcp"],
    dockerfilePath: "/tmp/test-repo/Dockerfile",
    railpackPlanPath: null,
  };
}

describe("buildDockerImage image reference", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuccessfulBuild();
  });

  it("defaults to app-image:latest when no image options are given", async () => {
    const result = await buildDockerImage(registryData, makeRepositoryData());

    const expected = `registry.test.project.space/${DEFAULT_IMAGE_NAME}:${DEFAULT_IMAGE_TAG}`;
    expect(result.imageName).toBe(expected);
    expect(getBuiltImageName()).toBe(expected);
  });

  it("uses a custom image name and tag when provided", async () => {
    const result = await buildDockerImage(registryData, makeRepositoryData(), {
      name: "my-app",
      tag: "v1.2.3",
    });

    const expected = "registry.test.project.space/my-app:v1.2.3";
    expect(result.imageName).toBe(expected);
    expect(getBuiltImageName()).toBe(expected);
  });

  it("falls back to defaults for individually omitted options", async () => {
    const result = await buildDockerImage(registryData, makeRepositoryData(), {
      tag: "release",
    });

    expect(result.imageName).toBe(
      `registry.test.project.space/${DEFAULT_IMAGE_NAME}:release`
    );
  });
});
