# Container Deploy

Reusable orchestration and API adapters for building and deploying containerized projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)

## Overview

`container-deploy` is a TypeScript library that provides a unified interface for orchestrating Docker-based application deployments with the Mittwald API. It handles the complete deployment pipeline including Docker image building, registry management, and service deployment.

The library is organized around a **three-tier architecture** that cleanly separates concerns and enables flexible composition:

- **Entities** (Tier 1) – Single-responsibility API wrappers and operations
- **Orchestration** (Tier 2) – Multi-step workflows coordinating entities  
- **Consumers** (Tier 3) – Applications using either tier depending on needs

This architecture enables both high-level deployment (`deployProject()`) and fine-grained control over individual operations.

## Features

- **Modular Architecture** – Three-tier design with clear separation of concerns
- **Docker Integration** – Seamless Docker image building and pushing
- **Registry Management** – Automatic registry setup and configuration
- **Service Deployment** – Quick and reliable service deployment
- **Secure Credentials** – Built-in password generation with special character support
- **Duration Handling** – Flexible timeout and scheduling utilities
- **TypeScript First** – Fully typed API for excellent IDE support
- **Well Tested** – Comprehensive jest test suite included

## Installation

```bash
npm install container-deploy
```

### Prerequisites

- Node.js 18+
- TypeScript 5.9+
- Docker (for image building)
- Mittwald API Client credentials

## Architecture

### Three-Tier Design Pattern

```
┌─────────────────────────────────────────────────────┐
│ Tier 3: Consumers                                   │
│ (CLI, CI/CD, external tools use either tier below)  │
└──────────┬──────────────────────────────────────────┘
           │
      ┌────┴─────────────────────────────────┐
      │                                        │
┌─────▼──────────────────────┐  ┌────────────▼──────────────────┐
│ Tier 2: Orchestration      │  │ Tier 1: Entities (Direct)    │
│ Multi-step workflows       │  │ Single-responsibility ops    │
│ (deploy_project.ts,        │  │ (registry.ts, domain.ts,     │
│  registry_setup.ts)        │  │  service.ts, docker.ts)      │
└────────────┬───────────────┘  │                              │
             │                  │  Can be used independently   │
       ┌─────▼──────────────────┤  for fine-grained control    │
       │                        │                              │
       │  Compose & delegate    └──────────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────────┐
│ External Dependencies (@mittwald/api-client, Docker CLI)   │
└───────────────────────────────────────────────────────────┘
```

### Entity Modules (Tier 1)

Pure API wrappers with no orchestration logic. Each handles a single domain:

#### `entities/registry.ts` – Container Registry API
- **Responsibility**: Container registry operations via Mittwald API
- **Key Functions**:
  - `getProjectRegistry()` – Fetch existing registry for a project
  - `createRegistry()` – Create new registry service  
  - `checkProjectRegistry()` – Verify registry exists
- **Used By**: `registry_setup.ts`, direct consumers for registry-only operations

#### `entities/service.ts` – Service Deployment API
- **Responsibility**: Service creation and deployment via Mittwald API
- **Key Functions**:
  - `deployService()` – Deploy a standard service (returns full DeployRes)
  - `deployServiceAs(apiClient, projectId, serviceName, serviceConfig, timeout)` – Deploy any named service with custom config (returns service ID string)
- **Used By**: `registry_setup.ts` for registry service, `deploy_project.ts` for application service
- **Example**: Registry setup uses `deployServiceAs()` to create the container registry service

#### `entities/domain.ts` – Domain & Ingress API
- **Responsibility**: Domain creation and ingress readiness checking
- **Key Functions**:
  - `createDomain()` – Create ingress for a service
  - `waitForDomainReachable()` – Poll until domain IPs assigned and TLS certificate created
  - `waitForIngressReady()` – Semantic alias for clarity in orchestration contexts
  - `createAndWaitForDomain()` – Combine domain creation and waiting
- **Used By**: `registry_setup.ts` to expose registry, direct consumers for domain operations

#### `entities/docker.ts` – Docker Operations
- **Responsibility**: Docker image building, checking, and pushing
- **Key Functions**:
  - `checkDocker()` – Verify Docker is installed and running
  - `checkRailpack()` – Verify Railpack build tool is available
  - `localDockerBuild()` – Build Docker image locally
  - `localBuildWithRailpack()` – Build with Mittwald's Railpack tool
  - `buildDockerImage()` – Smart build selection (Railpack if available, else Docker)
  - `localDockerPush()` – Push image to registry
- **Used By**: `deploy_project.ts` for image building/pushing

### Orchestration Modules (Tier 2)

Multi-step workflows that compose entities to achieve higher-level goals:

#### `orchestration/registry_setup.ts` – Complete Registry Orchestration
- **Responsibility**: Full registry setup pipeline (service → domain → registration)
- **Key Function**: `setupProjectRegistry()` executes 6 steps:
  1. Check if registry already exists
  2. Create registry service via `service.ts`
  3. Create and wait for registry domain via `domain.ts`
  4. **Wait 2 minutes** for DNS/TLS propagation (documented Mittwald platform behavior)
  5. Register in Mittwald API via `registry.ts`
  6. Return registry details
- **Uses**: All entity modules (registry, service, domain)
- **Pattern**: Step orchestration with error handling and timeouts

#### `orchestration/deploy_project.ts` – Complete Project Deployment
- **Responsibility**: Full end-to-end deployment (registry → build → push → deploy)
- **Key Function**: `deployProject()` executes sequence:
  1. Validate environment
  2. Set up project registry via `registry_setup.ts`
  3. Build Docker image via `docker.ts`
  4. Push image to registry via `docker.ts`
  5. Deploy service via `service.ts`
- **Uses**: All entity modules plus registry orchestration
- **Entry Point**: Primary API exported for consumer use

## Quick Start

### High-Level: Complete Deployment

```typescript
import { deployProject, Duration } from 'container-deploy';

// Deploy entire project (registry setup + build + push + service)
const result = await deployProject({
  apiClient: myApiClient,
  projectId: 'your-project-id',
  waitTimeout: Duration.fromSeconds(600),
});

console.log(`✓ Deployed: ${result.serviceName} (${result.deployedServiceId})`);
```

### Mid-Level: Custom Registry Setup

```typescript
import { setupProjectRegistry } from 'container-deploy';
import { buildDockerImage, localDockerPush } from 'container-deploy';

// Set up registry with custom timeout
const registry = await setupProjectRegistry(
  apiClient,
  projectId,
  Duration.fromMinutes(5)
);

// Then handle build/push with your own logic
await buildDockerImage(buildDir, registry.username, registry.password);
await localDockerPush(imageName, registry.host, registry.username, registry.password);
```

### Fine-Grained: Compose Entities Directly

```typescript
import {
  checkProjectRegistry,
  createRegistry,
  createDomain,
  waitForDomainReachable,
} from 'container-deploy';

// Check existing registry
const existing = await checkProjectRegistry(apiClient, projectId);
if (!existing) {
  // Create registry service
  const serviceId = await deployServiceAs(apiClient, projectId, 'registry', {...});
  
  // Expose via domain
  const domain = await createDomain(apiClient, serviceId, {...});
  await waitForDomainReachable(apiClient, domain.id, Duration.fromMinutes(2));
}
```

## Core API Reference

### Main Exports

#### `deployProject(options: DeployOptions): Promise<DeployResult>`

Complete deployment pipeline: registry setup → Docker build → push → service deployment.

**Parameters:**
- `apiClient` – Mittwald API v2 client instance
- `projectId` – UUID of target project
- `waitTimeout` – Maximum time to wait for operations

**Returns:**
```typescript
{
  deployedServiceId: string;  // ID of deployed service
  serviceName: string;         // Service name
}
```

#### `setupProjectRegistry(apiClient, projectId, timeout): Promise<RegistryData>`

Set up complete registry infrastructure (service + domain + registration).

**Parameters:**
- `apiClient` – Mittwald API v2 client instance
- `projectId` – UUID of target project  
- `timeout` – Maximum time to wait for registry readiness

**Returns:**
```typescript
{
  id: string;              // Registry service ID
  projectId: string;       // Project UUID
  host: string;            // Registry hostname/domain
  username: string;        // Registry username
  password: string;        // Registry password
  source: 'existing' | 'created';  // Whether newly created or already existed
}
```

### Docker Operations

```typescript
import { buildDockerImage, localDockerPush, checkDocker } from 'container-deploy';

// Check Docker availability
await checkDocker();

// Build image (auto-selects Railpack or Docker)
await buildDockerImage(buildDir, dockerUsername, dockerPassword);

// Push to registry
await localDockerPush(imageName, registryHost, username, password);
```

### Entity APIs

```typescript
import {
  // Registry
  getProjectRegistry,
  createRegistry,
  checkProjectRegistry,
  
  // Service
  deployService,
  deployServiceAs,
  
  // Domain
  createDomain,
  waitForDomainReachable,
  createAndWaitForDomain,
} from 'container-deploy';

// Example: Create registry domain
const domain = await createAndWaitForDomain(
  apiClient,
  serviceId,
  { ingressName: 'my-registry', tlsEnabled: true },
  Duration.fromMinutes(3)
);
```

### Utility Classes

#### `Duration`

Flexible duration handling for timeouts and scheduling:

```typescript
import { Duration } from 'container-deploy';

// Creation methods
const dur1 = Duration.fromSeconds(30);
const dur2 = Duration.fromMilliseconds(5000);
const dur3 = Duration.fromZero();

// Calculations
const combined = dur1.add(dur2);
const futureDate = dur1.fromNow();
const comparison = dur1.compare(dur2);

// Conversion
console.log(dur1.seconds);      // 30
console.log(dur1.milliseconds); // 30000
```

#### Password Generation

```typescript
import { generatePassword, generatePasswordWithSpecialChars } from 'container-deploy';

// Basic password (32 chars, alphanumeric)
const password = generatePassword();

// With special characters (32 chars, 4 special)
const securePassword = generatePasswordWithSpecialChars(32, 4);
```

## Design Patterns & Architecture Notes

### 1. **Single Responsibility Principle**

Each entity module handles exactly one domain:
- **registry.ts** = Mittwald Container Registry API only
- **service.ts** = Mittwald Service deployment API only
- **domain.ts** = Mittwald Domain/Ingress API only
- **docker.ts** = Local Docker operations only

This separation enables:
- Code reuse across different orchestration flows
- Independent testing of each domain
- Clear import dependencies (no circular imports)
- Easy extension with new orchestration workflows

### 2. **Composable Orchestration**

Entity operations are stateless and composable. Orchestration modules (`registry_setup.ts`, `deploy_project.ts`) coordinate them:

```
User Request
    ↓
Orchestration Module ← Decides flow & manages state
    ↓
    ├→ Entity 1 ← Pure operation (Get → Transform → Return)
    ├→ Entity 2 ← Pure operation (Post → Wait → Return)
    └→ Entity 3 ← Pure operation (Validate → Transform → Return)
    ↓
Result
```

This allows:
- New orchestration flows without modifying entities
- Testing orchestration logic independently of entities
- Different consumers composing entities differently (e.g., CLI might use registry setup orchestration, CI/CD might compose entities directly)

### 3. **Waiting Patterns**

All operations that require polling use `waitUntil()` helper with exponential backoff:

```typescript
// Example from domain.ts
await waitUntil(
  () => isIngressReady(ingress),  // Poll condition
  Duration.fromSeconds(1),        // Initial wait
  Duration.fromMinutes(3),        // Max total time
);
```

Critical known issue: Registry setup includes **hardcoded 2-minute wait** before API registration (documented Mittwald behavior for DNS/TLS propagation). This prevents race conditions when domain is created but not yet globally available.

### 4. **Type Safety at Boundaries**

All public functions are fully typed. Internal helper types are in `src/types/index.ts`:

```typescript
export interface RegistryData {
  id: string;
  projectId: string;
  host?: string;              // Optional because checkProjectRegistry doesn't populate
  username: string;
  password: string;
  source: 'existing' | 'created';
}

export interface DeployOptions {
  apiClient: MittwaldAPIV2Client;
  projectId: string;
  waitTimeout: Duration;
}
```

The optional `host` field in `RegistryData` is intentional – different code paths populate different fields.

## Development & Extension

### Adding a New Orchestration Flow

1. **Identify entities needed** – Which entity modules are involved?
2. **Create new orchestration file** – `src/orchestration/my_flow.ts`
3. **Compose entity imports** – Import needed entity functions
4. **Define flow function** – Export main function that coordinates steps
5. **Update exports** – Add to `src/index.ts`
6. **Add tests** – Mock entity modules in test suite

Example: If you need "registry + service without domain":

```typescript
// src/orchestration/registry_and_service_setup.ts
import { createRegistry } from '../entities/registry';
import { deployServiceAs } from '../entities/service';

export async function setupRegistryAndService(
  apiClient: MittwaldAPIV2Client,
  projectId: string,
  timeout: Duration
): Promise<{ registry: RegistryData; serviceId: string }> {
  const registry = await createRegistry(apiClient, projectId);
  const serviceId = await deployServiceAs(apiClient, projectId, 'app', {...});
  return { registry, serviceId };
}
```

### Adding New Entity Operations

1. **Identify domain** – Does it belong in existing module or new one?
2. **Add function** – Export from entity module, keep pure (no multi-step logic)
3. **Type all parameters** – Leverage MittwaldAPIV2Client types
4. **Document side effects** – Comment on API calls, state changes, waiting
5. **Test independently** – Mock API client in test suite

### Testing Strategy

- **Unit tests** – Entity functions with mocked API client
- **Integration tests** – Orchestration functions with mocked entity functions
- **End-to-end tests** – Full flows against real API (in CI with proper credentials)

Current test suite validates primary `deployProject()` flow with mocked dependencies. See `test/deploy.test.ts` for patterns.

## Known Limitations & Considerations

1. **Registry DNS Propagation** – 2-minute hardcoded wait in `registry_setup.ts` is necessary for Mittwald platform
2. **Docker Availability** – Operations in `docker.ts` require local Docker installation
3. **File:// Dependencies** – When using in another package, ensure proper dependency management (Yarn 3.x tracks via content hash)
4. **Timeout Heuristics** – Durations in orchestration are conservative estimates; adjust based on actual deployment patterns

## Contributing

This package follows TypeScript strict mode and Jest testing conventions. Before committing:

```bash
npm run build      # Compile TypeScript
npm run test       # Run test suite (jest)
npm run lint       # Type check (tsc --noEmit)
```

All new features should include:
- Type definitions in `src/types/index.ts` if needed
- Implementation in appropriate entity or orchestration module
- Tests in `test/`
- Documentation in this README

## Project Structure

```
src/
├── entities/          # Core domain entities
│   ├── docker.ts      # Docker build configuration
│   ├── project.ts     # Project metadata
│   ├── registry.ts    # Registry setup and image operations
│   ├── repository.ts  # Repository validation
│   └── service.ts     # Service deployment logic
├── orchestration/     # High-level orchestration
│   └── deploy_project.ts  # Main deployment orchestrator
├── types/            # TypeScript type definitions
│   └── index.ts      # Core types (DeployOptions, DeployResult, etc.)
└── utils/            # Utility functions
    └── helpers.ts    # Duration, password generation, etc.

test/
└── deploy.test.ts    # Integration tests for deployProject
```

## Development

### Setup

```bash
npm install
npm run build
```

### Building

```bash
# One-time build
npm run build

# Watch mode for development
npm run build:watch
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch
```

Tests are configured with Jest and ts-jest for TypeScript support. Current test coverage includes full integration tests for the `deployProject` function.

## Type Definitions

### `DeployOptions`
```typescript
{
  apiClient: any;           // Mittwald API client
  projectId: string;        // Project UUID
  waitTimeout: Duration;    // Deployment timeout
}
```

### `DeployResult`
```typescript
{
  deployedServiceId: string; // ID of deployed service
  serviceName: string;       // Name of deployed service
}
```

### `RegistryData`
```typescript
{
  username: string;
  password: string;
  uri: string;
  host: string;
  registryServiceId: string;
  registry: any;
  created?: boolean;
}
```

### `RepositoryData`
```typescript
{
  buildContext: string;
  ports: string[];
  dockerfilePath?: string;
  dockerfileContent?: string;
  dockerfileCreated?: boolean;
  imageId?: string;
  imageName?: string;
  railpackPlanPath?: string | null;
}
```

## Configuration

The library uses sensible defaults:

- **Default password length:** 32 characters
- **Special characters in passwords:** ~12.5% of password length
- **Allowed special characters:** `%`, `_`, `-`, `+`, `&`

## Architecture

The deployment pipeline follows these steps:

1. **Project Lookup** – Convert project UUID to short ID
2. **Environment Validation** – Check Docker and Railpack availability
3. **Registry Setup** – Create/configure container registry
4. **Repository Validation** – Check local repository state
5. **Image Building** – Build Docker image with buildkit
6. **Image Push** – Push to configured registry
7. **Service Deployment** – Deploy service to Mittwald infrastructure

## License

MIT License – see [LICENSE](LICENSE) file for details

## Author

Lars Bergmann <l.bergmann@mittwald.de>

---

For more information or issues, please visit the [GitHub repository](https://github.com/your-org/container-deploy).
