## [1.6.2](https://github.com/mittwald/container-deploy/compare/v1.6.1...v1.6.2) (2026-09-04)


### Bug Fixes

* **registry:** provide volume name as part of volume definition ([#20](https://github.com/mittwald/container-deploy/issues/20)) ([1122165](https://github.com/mittwald/container-deploy/commit/1122165533d6a52d2a2a233328151cdd8f09e75c))

## [1.6.1](https://github.com/mittwald/container-deploy/compare/v1.6.0...v1.6.1) (2026-07-22)


### Bug Fixes

* **registry:** mount a persistent volume for the project registry ([#18](https://github.com/mittwald/container-deploy/issues/18)) ([9753242](https://github.com/mittwald/container-deploy/commit/9753242f6e62798da9aacda0f6d853a6c2fb7234))

# [1.6.0](https://github.com/mittwald/container-deploy/compare/v1.5.0...v1.6.0) (2026-07-01)


### Features

* **service:** make service name configurable ([#16](https://github.com/mittwald/container-deploy/issues/16)) ([b942226](https://github.com/mittwald/container-deploy/commit/b9422265f15cd59d5ef79625f00ce8d369ed7587))

# [1.5.0](https://github.com/mittwald/container-deploy/compare/v1.4.0...v1.5.0) (2026-06-19)


### Features

* **docker:** make image name and tag configurable ([#14](https://github.com/mittwald/container-deploy/issues/14)) ([8748b9d](https://github.com/mittwald/container-deploy/commit/8748b9dc86fa97afa6beaf48aaf699441773b316))

# [1.4.0](https://github.com/mittwald/container-deploy/compare/v1.3.0...v1.4.0) (2026-06-19)


### Bug Fixes

* **docker:** always build linux/amd64 images ([#9](https://github.com/mittwald/container-deploy/issues/9)) ([5c654f8](https://github.com/mittwald/container-deploy/commit/5c654f80271212e166677056ebcd344282d2d025))
* **release:** add missing release configuration ([54832ba](https://github.com/mittwald/container-deploy/commit/54832baed5c0d7fbc206545770968d3bb63d4dd1))


### Features

* **docker:** reuse a running BuildKit builder for Railpack builds ([1fc9c3f](https://github.com/mittwald/container-deploy/commit/1fc9c3f50d10fc5e6ec352c0af80756776511375))
