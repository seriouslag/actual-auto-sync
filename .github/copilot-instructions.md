# Copilot Instructions for actual-auto-sync

This document provides guidance for GitHub Copilot Coding Agent when working on this repository.

## Project Overview

This is a TypeScript-based Node.js background service that automatically runs bank sync on a scheduled basis for Actual Budget. It uses:
- TypeScript with ESM modules
- pnpm as the package manager
- Vitest for testing
- Docker for deployment
- The official Actual Budget API (@actual-app/api)

## Build and Test

### Prerequisites
- Node.js >= 22 (specifically 24.11.0 in CI)
- pnpm 10.21.0

### Commands
- **Install dependencies**: `pnpm install --frozen-lockfile`
- **Build**: `pnpm build` (runs TypeScript compiler)
- **Run tests**: `pnpm test` (runs Vitest)
- **Run tests with coverage**: `pnpm test:coverage`
- **Start the service**: `pnpm start` (requires .env configuration)

### Build Process
1. Always run `pnpm install --frozen-lockfile` after cloning or when dependencies change
2. Run `pnpm build` to compile TypeScript to JavaScript (outputs to `dist/`)
3. Run `pnpm test` to verify all tests pass before submitting changes

## Code Style and Conventions

### TypeScript
- Use strict TypeScript configuration (see tsconfig.json)
- Target: ES2024
- Module system: NodeNext (ESM)
- Always include `.js` extensions in import statements (ESM requirement)
- Use type-safe environment variable validation with zod schemas

### Testing
- Use Vitest for all tests
- Test files should be in `src/__tests__/` directory
- Test file naming: `*.test.ts`
- Write unit tests for all new functionality
- Maintain high test coverage (tests are run with coverage in CI)

### Environment Variables
- Define all environment variables in `src/env.ts` using zod schemas
- Use the @t3-oss/env-core package for type-safe environment validation
- Document environment variables in both env.ts and README.md
- All environment variables should have sensible defaults where applicable

### Logging
- Use the pino logger from `src/logger.ts`
- Log levels: info, debug, warn, error
- Include context in log messages where appropriate
- Avoid logging sensitive information (passwords, tokens, etc.)

### Code Organization
- Keep source files in `src/` directory
- Test files in `src/__tests__/`
- Use ESM imports/exports
- Follow single responsibility principle
- Keep functions small and focused

## Docker

- The project includes a Dockerfile for containerized deployment
- Docker images are built and pushed to Docker Hub automatically on main branch
- When modifying the Dockerfile, ensure it still builds successfully
- Environment variables are passed to the container at runtime

## CI/CD

### Workflows
- **PR workflow** (`pr.yml`): Runs on pull requests, executes build and tests
- **Main workflow** (`main.yml`): Runs on main branch, builds, tests, and deploys Docker image

### CI Requirements
- All tests must pass
- TypeScript must compile without errors
- Code coverage is uploaded to Codecov (but doesn't fail the build)

## Dependencies

### Adding Dependencies
- Use `pnpm add <package>` for production dependencies
- Use `pnpm add -D <package>` for dev dependencies
- Always commit the updated `pnpm-lock.yaml` file
- Document new dependencies and their purpose in commit messages

### Core Dependencies
- `@actual-app/api`: Official Actual Budget API
- `cron`: Scheduling library for running syncs on a schedule
- `zod`: Runtime type validation for environment variables
- `pino`: Fast and efficient logging

## Common Tasks

### Adding a new environment variable
1. Add the schema to `src/env.ts` using zod
2. Add it to the env configuration object
3. Document it in README.md
4. Add tests in `src/__tests__/env.test.ts`

### Adding new functionality
1. Create the implementation in `src/`
2. Add comprehensive tests in `src/__tests__/`
3. Update documentation if user-facing
4. Run build and tests locally before committing

### Modifying the sync logic
- Main entry point: `src/index.ts`
- Cron job creation: `src/cron.ts`
- Be cautious with changes to the Actual Budget API integration
- Test thoroughly as this affects users' financial data

## Best Practices

1. **Minimal changes**: Make the smallest possible changes to achieve the goal
2. **Type safety**: Leverage TypeScript's type system for safety
3. **Error handling**: Handle errors gracefully and log them appropriately
4. **Testing**: Write tests for new functionality and ensure existing tests pass
5. **Documentation**: Update README.md when adding user-facing features
6. **Security**: Never commit secrets, API keys, or sensitive data
7. **Backwards compatibility**: Avoid breaking changes to environment variables or behavior

## Security Considerations

- Never log sensitive information (passwords, encryption keys, API tokens)
- Validate all environment variables before use
- Use secure practices when handling financial data
- The service connects to external Actual Budget servers - ensure secure connections

## Troubleshooting

### Build Issues
- Ensure Node.js version matches requirements (>= 22)
- Clear cache: `rm -rf node_modules dist && pnpm install --frozen-lockfile`
- Check TypeScript errors: `pnpm build`

### Test Failures
- Run tests in watch mode: `pnpm test`
- Check for environment variable issues
- Review test logs for specific failure reasons

### Docker Issues
- Build locally: `docker build -t actual-auto-sync .`
- Ensure all required files are included (check .dockerignore)
