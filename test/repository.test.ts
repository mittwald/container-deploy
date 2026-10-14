import fs from "fs/promises";
import os from "os";
import path from "path";
import { execSync } from "child_process";

import { checkRepository } from "../src/entities/repository";
import { pathExists } from "../src/utils/helpers";

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

const execSyncMock = execSync as jest.MockedFunction<typeof execSync>;

describe("checkRepository", () => {
  const initialCwd = process.cwd();
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "container-deploy-repo-test-"));
    process.chdir(testDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(initialCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should prioritize environment PORT as the primary mapping", async () => {
    await fs.writeFile(
      path.join(testDir, "Dockerfile"),
      "FROM node:20\nEXPOSE 3000 4000\n",
      "utf-8",
    );

    const repositoryData = await checkRepository({ PORT: "8787" });

    expect(repositoryData.ports[0]).toBe("8787:8787/tcp");
    expect(repositoryData.ports).toContain("3000:3000/tcp");
    expect(repositoryData.ports).toContain("4000:4000/tcp");
  });

  it("should not duplicate mapping when environment PORT already exists in Dockerfile ports", async () => {
    await fs.writeFile(
      path.join(testDir, "Dockerfile"),
      "FROM node:20\nEXPOSE 8787 3000\n",
      "utf-8",
    );

    const repositoryData = await checkRepository({ PORT: "8787" });

    expect(repositoryData.ports).toEqual(["8787:8787/tcp", "3000:3000/tcp"]);
  });

  it("should keep fallback primary port when environment PORT is invalid", async () => {
    await fs.writeFile(
      path.join(testDir, "Dockerfile"),
      "FROM nginx:alpine\n",
      "utf-8",
    );

    const repositoryData = await checkRepository({ PORT: "invalid" });

    expect(repositoryData.ports[0]).toBe("80:80/tcp");
  });

  it("should throw railpack output when railpack plan generation fails", async () => {
    const railpackError = new Error("Command failed: railpack prepare .") as Error & {
      stdout: string;
      stderr: string;
    };
    railpackError.stdout = "detected project files";
    railpackError.stderr = "unsupported project layout";
    execSyncMock.mockImplementationOnce(() => {
      throw railpackError;
    });

    await expect(checkRepository()).rejects.toThrow(
      /Railpack failed to prepare a build plan[\s\S]*detected project files[\s\S]*unsupported project layout/,
    );
    await expect(pathExists(path.join(testDir, "Dockerfile"))).resolves.toBe(false);
  });

  it("should throw when railpack succeeds without writing a plan", async () => {
    execSyncMock.mockReturnValueOnce("");

    await expect(checkRepository()).rejects.toThrow(
      "Railpack finished successfully but did not create railpack-plan.json",
    );
    await expect(pathExists(path.join(testDir, "Dockerfile"))).resolves.toBe(false);
  });
});
