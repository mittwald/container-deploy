import fs from "fs/promises";
import os from "os";
import path from "path";

import { checkRepository } from "../src/entities/repository";

describe("checkRepository", () => {
  const initialCwd = process.cwd();
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "container-deploy-repo-test-"));
    process.chdir(testDir);
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
});
