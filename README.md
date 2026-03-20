# Container Deploy

Reusable orchestration and API adapters for building and deploying containerized projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)

## Overview

`container-deploy` is a TypeScript library that provides a unified interface for orchestrating Docker-based application deployments with the Mittwald API. It handles the complete deployment pipeline including Docker image building, registry management, and service deployment.

## Features

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

## Quick Start

```typescript
import { deployProject } from 'container-deploy';
import { Duration } from 'container-deploy';

const result = await deployProject({
  apiClient: myApiClient,
  projectId: 'your-project-id',
  waitTimeout: Duration.fromSeconds(300),
});

console.log(`Deployed service: ${result.serviceName} (${result.deployedServiceId})`);
```

## Core API

### `deployProject(options: DeployOptions)`

The main entry point for deploying a containerized project.

**Parameters:**
- `apiClient` – Mittwald API client instance
- `projectId` – UUID of the project to deploy
- `waitTimeout` – Maximum time to wait for deployment (Duration)

**Returns:** `DeployResult` containing:
- `deployedServiceId` – ID of the deployed service
- `serviceName` – Name of the deployed service

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
console.log(dur1.seconds); // 30
console.log(dur1.milliseconds); // 30000
```

### Password Generation

```typescript
import { generatePassword, generatePasswordWithSpecialChars } from 'container-deploy';

// Basic password (32 chars by default)
const password = generatePassword();

// Password with special characters
const securePassword = generatePasswordWithSpecialChars(32, 4); // 4 special chars
```

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
