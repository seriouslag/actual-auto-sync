# Copilot Instructions for actual-auto-sync

## Build and Test

**Prerequisites:** Node.js >= 22, pnpm >= 10.8.1

**Commands:**
- `pnpm install --frozen-lockfile` - Install dependencies
- `pnpm build` - Compile TypeScript
- `pnpm test` - Run tests
- `pnpm test:coverage` - Run tests with coverage

Always run build and tests before committing changes.

## Code Style and Conventions

### TypeScript
- Use strict TypeScript (ES2024, NodeNext modules)
- **Always include `.js` extensions in import statements** (ESM requirement)
- Use type-safe environment variable validation with zod schemas

### Testing
- Use Vitest for all tests
- Test files: `src/__tests__/*.test.ts`
- Write unit tests for all new functionality
- Maintain high test coverage

### Environment Variables
- Define all environment variables in `src/env.ts` using zod schemas
- Use @t3-oss/env-core package for type-safe validation
- Document in both env.ts and README.md
- Add tests in `src/__tests__/env.test.ts`

### Logging
- Use pino logger from `src/logger.ts`
- Never log sensitive information (passwords, encryption keys, API tokens)

## Common Tasks

### Adding a new environment variable
1. Add schema to `src/env.ts` using zod
2. Add to env configuration object
3. Document in README.md
4. Add tests in `src/__tests__/env.test.ts`

### Modifying sync logic
- Main entry point: `src/index.ts`
- Cron job creation: `src/cron.ts`
- Test thoroughly - affects users' financial data

## Best Practices

1. Make minimal changes to achieve the goal
2. Leverage TypeScript's type system for safety
3. Handle errors gracefully and log appropriately
4. Write tests for new functionality
5. Update README.md for user-facing features
6. Never commit secrets or sensitive data
7. Avoid breaking changes to environment variables
