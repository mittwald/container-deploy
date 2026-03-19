import { deployProject } from "../src/orchestration/deploy_project";
import { createApiClient } from "@mittwald/api-client"; // or the right export path
import { mocked } from "ts-jest/utils"; // For tight, type-safe manual mocks

// --- Setup dummy/mock variables:
const TEST_TOKEN = "test-token";
const TEST_BASE_URL = "http://localhost:12345"; // Your local mock API endpoint
const TEST_REPO_URL = "https://github.com/your-org/simple-test-repo";

// --- Optional: mock or spy on methods (if you want to intercept or stub)

// Sample: mock Docker build/export logic if you want to not hit actual Docker
jest.mock("../src/entities/docker", () => ({
  buildDockerImage: jest.fn(async (...args) => ({
    // Return structure matching your normal function
    imageName: "local/test-image:latest",
    // ...other RepositoryData fields
  })),
  localDockerPush: jest.fn(async () => {
    // Can be empty; we're not testing "push"
  }),
}));

// If your entities use @mittwald/api-client directly, you can mock or spy on
// its methods as needed using jest.spyOn

describe("deployProject integration test", () => {
  it("should build and deploy from scratch with mocked API and docker", async () => {
    // 1. Instantiate client
    const client = createApiClient({
      token: TEST_TOKEN,
      baseUrl: TEST_BASE_URL,
    });

    // 2. Prepare minimal inputs
    const options = {
      projectId: "test-project",
      apiClient: client,
      waitTimeout: 10000,
      // ...anything else you need for deployProject
    };

    // 3. Run deploy orchestration
    const result = await deployProject(options);

    // 4. Assert desired calls/results
    // For example, ensure deployProject returns expected structure
    expect(result.deployedServiceId).toBeDefined();
    // If you want to ensure "docker.buildDockerImage" was called:
    // @ts-ignore-next-line
    expect(require("../src/entities/docker").buildDockerImage).toHaveBeenCalled();

    // You could also check that client methods were called with correct parameters using jest.spyOn
  });
});