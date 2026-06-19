/*
    Helper module to manage Docker operations.
    Provides functions to check Docker/Railpack installation,
    build Docker images locally, and push to registries.
*/

import { spawnSync, execSync } from "child_process";

import {
    RegistryData,
    RepositoryData,
} from "../types/index.js";

interface ToolCheckResult {
    available: boolean;
    error?: string;
}

// Defaults used for the built image reference when the caller does not
// override them. The full reference is `${registryHost}/${name}:${tag}`.
export const DEFAULT_IMAGE_NAME = "app-image";
export const DEFAULT_IMAGE_TAG = "latest";

export interface ImageOptions {
    name?: string;
    tag?: string;
}

/**
 * Builds the fully-qualified image reference (`registry/name:tag`) for a build,
 * falling back to the default name and tag when they are not provided.
 */
function buildImageReference(registryHost: string, imageOptions?: ImageOptions): string {
    const name = imageOptions?.name || DEFAULT_IMAGE_NAME;
    const tag = imageOptions?.tag || DEFAULT_IMAGE_TAG;
    return `${registryHost}/${name}:${tag}`;
}

// Name of the Buildx builder we create when no reusable one is found.
const MANAGED_BUILDER_NAME = "container-deploy-builder";

// Buildx drivers backed by a real BuildKit instance, which is required to run
// the Railpack frontend (custom BUILDKIT_SYNTAX). The default `docker` driver
// (classic builder) cannot, so it is intentionally excluded.
const BUILDKIT_DRIVERS = new Set(["docker-container", "remote", "kubernetes"]);

// All images are built for linux/amd64 regardless of the host architecture,
// since that is the platform the images are deployed to.
const TARGET_PLATFORM = "linux/amd64";

interface BuildxNode {
    Status?: string;
}

interface BuildxBuilder {
    Name?: string;
    Driver?: string;
    Current?: boolean;
    Nodes?: BuildxNode[];
}

/**
 * Returns the name of an existing Buildx builder backed by a BuildKit
 * instance (e.g. one the user already created, or a running remote builder),
 * or `null` if none is available.
 *
 * Parses `docker buildx ls --format=json`, which emits one JSON object per
 * line. A builder with a `running` node is preferred over an inactive one. If
 * `--format=json` is unsupported (older Buildx), the command fails or emits
 * unparseable output and we fall back to creating our own builder.
 */
function findBuildkitBuilder(): string | null {
    const listResult = spawnSync("docker", ["buildx", "ls", "--format=json"], {
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
    });

    if (listResult.status !== 0 || !listResult.stdout) {
        return null;
    }

    const candidates: BuildxBuilder[] = [];
    for (const line of listResult.stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        let builder: BuildxBuilder;
        try {
            builder = JSON.parse(trimmed);
        } catch {
            // Not JSON (e.g. older Buildx ignoring --format); skip the line.
            continue;
        }

        if (builder.Name && builder.Driver && BUILDKIT_DRIVERS.has(builder.Driver)) {
            candidates.push(builder);
        }
    }

    const running = candidates.filter((b) =>
        b.Nodes?.some((node) => node.Status === "running")
    );

    const chosen =
        running.find((b) => b.Current) ?? running[0] ?? candidates[0];

    return chosen?.Name ?? null;
}

/**
 * Ensures a Buildx builder backed by a BuildKit instance is available. Such a
 * driver is required for the Railpack frontend (custom BUILDKIT_SYNTAX) and
 * multi-platform builds; the default `docker` driver does not support them.
 *
 * Reuses an existing BuildKit-backed builder if one is present (e.g. the user
 * already ran `docker buildx create --use`), otherwise creates a dedicated
 * one with the `docker-container` driver. Returns the builder name to pass via
 * `--builder`, leaving the user's default builder untouched.
 */
function ensureBuildkitBuilder(): string {
    const existing = findBuildkitBuilder();
    if (existing) {
        return existing;
    }

    const createResult = spawnSync(
        "docker",
        [
            "buildx",
            "create",
            "--name",
            MANAGED_BUILDER_NAME,
            "--driver",
            "docker-container",
        ],
        { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" }
    );

    if (createResult.status !== 0) {
        // A builder with this name may already exist from a previous run;
        // tolerate that and reuse it. Any other failure is fatal.
        const stderr = createResult.stderr ?? "";
        if (!stderr.includes("existing instance")) {
            throw new Error(
                "Failed to create a Buildx builder for the Railpack build: " +
                    (stderr.trim() || createResult.error?.message || "unknown error")
            );
        }
    }

    return MANAGED_BUILDER_NAME;
}

/**
 * Detect whether the current host runs on an ARM architecture.
 * On such hosts a plain `docker build` cannot produce linux/amd64
 * images reliably, so we fall back to `docker buildx`.
 */
function isArmHost(): boolean {
    return process.arch === "arm" || process.arch === "arm64";
}

/**
 * Checks if Docker is installed and available in the system PATH. Returns a
 * result object indicating availability and error details if unavailable.
 */
export function checkDocker(): ToolCheckResult {
    try {
        execSync("docker --version", { stdio: "pipe" });
        return { available: true };
    } catch (error) {
        return {
            available: false,
            error:
                "Docker is not installed or not available in your PATH. " +
                "Please install Docker from https://www.docker.com/products/docker-desktop or " +
                "ensure it is properly installed and available in your system PATH.",
        };
    }
}

/**
 * Checks if Railpack is installed and available in the system PATH. Returns a
 * result object indicating availability and error details if unavailable.
 */
export function checkRailpack(): ToolCheckResult {
    try {
        execSync("railpack --version", { stdio: "pipe" });
        return { available: true };
    } catch (error) {
        return {
            available: false,
            error:
                "Railpack is not installed or not available in your PATH. " +
                "Please install Railpack from https://railpack.io or " +
                "ensure it is properly installed and available in your system PATH.",
        };
    }
}

/**
 * Validates that both Docker and Railpack are installed. Collects all missing
 * tools and throws a single comprehensive error.
 */
export function checkRequiredTools(): void {
    const dockerCheck = checkDocker();
    const railpackCheck = checkRailpack();

    const missingTools: string[] = [];

    if (!dockerCheck.available && dockerCheck.error) {
        missingTools.push(dockerCheck.error);
    }

    if (!railpackCheck.available && railpackCheck.error) {
        missingTools.push(railpackCheck.error);
    }

    if (missingTools.length > 0) {
        throw new Error(missingTools.join("\n\n"));
    }
}

/**
 * Builds a Docker image from the local repository. Later down the line this
 * might be called remotely.
 */
export async function localDockerBuild(
    registryData: RegistryData,
    repositoryData: RepositoryData,
    imageOptions?: ImageOptions,
) {
    if (!repositoryData.dockerfilePath || !repositoryData.buildContext) {
        throw new Error(
            "Docker build requires dockerfilePath and buildContext"
        );
    }

    const registryHost = registryData.uri;
    const imageName = buildImageReference(registryHost, imageOptions);

    // Always build for linux/amd64. On ARM hosts a plain `docker build`
    // cannot reliably cross-build, so use `docker buildx` with an explicit
    // platform and load the result into the local Docker image store.
    const buildArgs = isArmHost()
        ? [
              "buildx",
              "build",
              "--platform",
              TARGET_PLATFORM,
              "--load",
              "-t",
              imageName,
              "-f",
              repositoryData.dockerfilePath,
              repositoryData.buildContext,
          ]
        : [
              "build",
              "--platform",
              TARGET_PLATFORM,
              "-t",
              imageName,
              "-f",
              repositoryData.dockerfilePath,
              repositoryData.buildContext,
          ];

    const buildResult = spawnSync("docker", buildArgs, {
        cwd: repositoryData.buildContext,
        stdio: "inherit",
    });

    if (buildResult.status !== 0) {
        throw new Error(
            `Docker build failed with status ${buildResult.status}`
        );
    }

    const inspectResult = spawnSync("docker", [
        "inspect",
        "--format={{.ID}}",
        imageName,
    ], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
    });

    if (inspectResult.status !== 0) {
        throw new Error(
            `Failed to inspect built image: ${inspectResult.stderr}`
        );
    }

    const imageId = inspectResult.stdout.trim();
    repositoryData.imageId = imageId;
    repositoryData.imageName = imageName;

    return repositoryData;
}

/**
 * Builds a Docker image using Railpack and Docker Buildx (BuildKit). This path
 * is more efficient for complex projects and provides better caching and
 * multi-platform builds.
 */
export async function localBuildWithRailpack(
    registryData: RegistryData,
    repositoryData: RepositoryData,
    imageOptions?: ImageOptions,
) {
    if (!repositoryData.railpackPlanPath) {
        throw new Error("Railpack plan path is required for buildx build");
    }

    if (!repositoryData.buildContext) {
        throw new Error("Build context is required for buildx build");
    }

    const registryHost = registryData.uri;
    const imageName = buildImageReference(registryHost, imageOptions);

    // The Railpack frontend requires the `docker-container` driver, which the
    // default Buildx builder does not provide. Reuse an existing one or create
    // a dedicated builder so the build works without manual setup.
    const builder = ensureBuildkitBuilder();

    const buildResult = spawnSync("docker", [
        "buildx",
        "build",
        "--builder",
        builder,
        // Always build for linux/amd64 regardless of the host architecture.
        "--platform",
        TARGET_PLATFORM,
        "--build-arg",
        "BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend",
        "-f",
        repositoryData.railpackPlanPath,
        "--output",
        `type=docker,name=${imageName}`,
        repositoryData.buildContext,
    ], {
        cwd: repositoryData.buildContext,
        stdio: "inherit",
    });

    if (buildResult.status !== 0) {
        throw new Error(
            `Docker buildx build failed with status ${buildResult.status}`
        );
    }

    const inspectResult = spawnSync("docker", [
        "inspect",
        "--format={{.ID}}",
        imageName,
    ], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
    });

    if (inspectResult.status !== 0) {
        throw new Error(
            `Failed to inspect built image: ${inspectResult.stderr}`
        );
    }

    const imageId = inspectResult.stdout.trim();
    repositoryData.imageId = imageId;
    repositoryData.imageName = imageName;

    return repositoryData;
}

/**
 * Entry point for building Docker images. Checks if `railpackPlanPath` is
 * available and decides which build method to use:
 * - If `railpackPlanPath` exists: uses Buildx with Railpack.
 * - Otherwise: falls back to a standard Docker build.
 */
export async function buildDockerImage(
    registryData: RegistryData,
    repositoryData: RepositoryData,
    imageOptions?: ImageOptions,
) {
    if (repositoryData.railpackPlanPath) {
        return await localBuildWithRailpack(registryData, repositoryData, imageOptions);
    }

    return await localDockerBuild(registryData, repositoryData, imageOptions);
}

/**
 * Pushes the built Docker image to the registry. Logs in to the registry first
 * with the provided credentials.
 */
export async function localDockerPush(
    repositoryData: RepositoryData,
    registryData: RegistryData,
) {
    // XXX: removing protocol shouldn't be needed
    const registryHost = registryData.uri.replace(/^https?:\/\//, "");
    const loginResult = spawnSync(
        "docker",
        [
            "login",
            registryHost,
            "-u",
            registryData.username,
            "-p",
            registryData.password,
        ],
        {
            stdio: "inherit",
        }
    );

    if (loginResult.status !== 0) {
        throw new Error(
            `Docker login failed with status ${loginResult.status}`
        );
    }

    const pushResult = spawnSync(
        "docker",
        [
            "push",
            repositoryData.imageName!,
        ],
        {
            stdio: "inherit",
        }
    );

    if (pushResult.status !== 0) {
        throw new Error(`Docker push failed with status ${pushResult.status}`);
    }
}
