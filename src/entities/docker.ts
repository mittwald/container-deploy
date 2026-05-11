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

export function checkDocker(): ToolCheckResult {
    /*
        Check if Docker is installed and available in the system PATH.
        Returns a result object indicating availability and error details if unavailable.
    */
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

export function checkRailpack(): ToolCheckResult {
    /*
        Check if Railpack is installed and available in the system PATH.
        Returns a result object indicating availability and error details if unavailable.
    */
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

export function checkRequiredTools(): void {
    /*
        Validate that both Docker and Railpack are installed.
        Collects all missing tools and throws a single comprehensive error.
    */
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

export async function localDockerBuild(
    registryData: RegistryData,
    repositoryData: RepositoryData,
) {
    /*
        Build docker image from local repository.
        Later down the line this might be called remotely.
    */

    if (!repositoryData.dockerfilePath || !repositoryData.buildContext) {
        throw new Error(
            "Docker build requires dockerfilePath and buildContext"
        );
    }

    const registryHost = registryData.uri;
    const imageName = `${registryHost}/app-image:latest`;

    const buildResult = spawnSync("docker", [
        "build",
        "-t",
        imageName,
        "-f",
        repositoryData.dockerfilePath,
        repositoryData.buildContext,
    ], {
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

export async function localBuildWithRailpack(
    registryData: RegistryData,
    repositoryData: RepositoryData,
) {
    /*
        Build Docker image using Railpack and Docker Buildx (buildkit).
        This path is more efficient for complex projects and provides
        better caching and multi-platform builds.
    */

    if (!repositoryData.railpackPlanPath) {
        throw new Error("Railpack plan path is required for buildx build");
    }

    if (!repositoryData.buildContext) {
        throw new Error("Build context is required for buildx build");
    }

    const registryHost = registryData.uri;
    const imageName = `${registryHost}/app-image:latest`;

    const buildResult = spawnSync("docker", [
        "buildx",
        "build",
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

export async function buildDockerImage(
    registryData: RegistryData,
    repositoryData: RepositoryData,
) {
    /*
        Entry point for building Docker images. Checks if railpackPlanPath
        is available and decides which build method to use:
        - If railpackPlanPath exists: uses buildx with railpack
        - Otherwise: falls back to standard Docker build
    */

    if (repositoryData.railpackPlanPath) {
        return await localBuildWithRailpack(registryData, repositoryData);
    }

    return await localDockerBuild(registryData, repositoryData);
}

export async function localDockerPush(
    repositoryData: RepositoryData,
    registryData: RegistryData,
) {
    /*
        Push the built Docker image to the registry.
        Logs in to the registry first with provided credentials.
    */

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
