/*
    Helper module to manage project repositories.
    Factored out in order to reuse the repository 
    setup logic in multiple commands,
    e.g. deploy and repository management commands,
    OR even in other programs, e.g. mStudio extensions
*/

import path from "path";
import { pathExists } from "../utils/helpers.js";
import fs from "fs/promises";
import { execSync } from "child_process";

import {
    RepositoryData
} from "../types/index.js";

const RAILPACK_PREPARE_COMMAND = 'railpack prepare . --plan-out railpack-plan.json --info-out railpack-info.json';

function errorOutputToString(output: unknown): string {
    if (typeof output === "string") {
        return output.trim();
    }

    return output === undefined || output === null ? "" : String(output).trim();
}

function formatRailpackError(error: unknown): Error {
    const maybeExecError = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
    const stdout = errorOutputToString(maybeExecError.stdout);
    const stderr = errorOutputToString(maybeExecError.stderr);
    const message = typeof maybeExecError.message === "string" ? maybeExecError.message.trim() : "";

    const details = [
        "Railpack failed to prepare a build plan.",
        `Command: ${RAILPACK_PREPARE_COMMAND}`,
        stdout ? `stdout:\n${stdout}` : null,
        stderr ? `stderr:\n${stderr}` : null,
        message ? `error:\n${message}` : null,
    ].filter((detail): detail is string => detail !== null);

    return new Error(details.join("\n\n"));
}

async function runRailpack(projectRoot: string): Promise<string | null> {
    try {
        execSync(RAILPACK_PREPARE_COMMAND, {
            cwd: projectRoot,
            stdio: 'pipe',
            encoding: "utf-8",
        });
        const planPath = path.join(projectRoot, 'railpack-plan.json');
        if (await pathExists(planPath)) {
            return planPath;
        }
    } catch (error) {
        throw formatRailpackError(error);
    }

    throw new Error(
        `Railpack finished successfully but did not create railpack-plan.json. Command: ${RAILPACK_PREPARE_COMMAND}`
    );
}

function extractPortsFromDockerfile(dockerfileContent: string): string[] {
    const portMappings: string[] = [];
    const containerPorts: Set<number> = new Set();
    const lines = dockerfileContent.split('\n');

    for (const line of lines) {
        const match = line.match(/^\s*EXPOSE\s+(.+)$/i);
        if (match) {
        const portSpec = match[1].trim();
        // Handle multiple ports on one line (e.g., "80 443")
        const portList = portSpec.split(/\s+/);
        for (const port of portList) {
            if (port) {
            // Extract just the port number (remove /udp if present)
            const portNum = parseInt(port.split('/')[0], 10);
            if (!isNaN(portNum) && !containerPorts.has(portNum)) {
                containerPorts.add(portNum);
            }
            }
        }
        }
    }

    // Convert container ports to host:container mappings
    // XXX: This is 1:1 mapping for now
    containerPorts.forEach(containerPort => {
        const protocol = '/tcp';
        let hostPort = containerPort;
        portMappings.push(`${hostPort}:${containerPort}${protocol}`);
    });

    return portMappings;
}

export async function checkRepository(environment?: Record<string, string>) {
    /*
        Check repository expected in current folder context.
    */
    const projectRoot = process.cwd();
    const dockerfilePath = path.join(projectRoot, "Dockerfile");
    let dockerfileContent: string;
    let railpackPlanPath: string | null = null;

    // 1. Check if Dockerfile exists
    if (await pathExists(dockerfilePath)) {
        // 1.1 Dockerfile is present, read it and skip railpack
        dockerfileContent = await fs.readFile(dockerfilePath, "utf-8");
    } else {
        // XXX: We should check for .dockerignore and warn if none is present,
        // to avoid accidentally including large or security relevant files in the build context
        // 1.2 No Dockerfile, try railpack for analysis
        railpackPlanPath = await runRailpack(projectRoot);

        dockerfileContent = "";
    }

    // Extract ports from the Dockerfile and create proper host:container mappings
    // If environment.PORT is present and valid, it is always the primary mapping.
    const ports = extractPortsFromDockerfile(dockerfileContent);
    const portFromEnvRaw = environment?.PORT;
    const portFromEnv = portFromEnvRaw ? parseInt(portFromEnvRaw, 10) : NaN;

    if (!isNaN(portFromEnv) && portFromEnv > 0) {
        const primaryPortMapping = `${portFromEnv}:${portFromEnv}/tcp`;
        const remainingPorts = ports.filter(port => port !== primaryPortMapping);
        ports.splice(0, ports.length, primaryPortMapping, ...remainingPorts);
    } else if (ports.length === 0) {
        ports.push("80:80/tcp");
    }

    const repositoryData = {
        dockerfilePath,
        dockerfileContent,
        buildContext: projectRoot,
        ports,
        railpackPlanPath,
    };
    return repositoryData as RepositoryData;
}