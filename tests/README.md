# Test Infrastructure

This directory contains the test suite for Avenize, organized by testing layer.

## Directory Structure

```
tests/
├── frontend/              # Frontend unit & component tests
│   ├── lib/              # Library/business logic tests
│   │   ├── auth.test.ts  # TOTP/2FA authentication tests
│   │   └── currency.test.ts # Currency formatting tests
│   ├── mocks/            # MSW mock handlers
│   │   ├── server.ts     # MSW server setup
│   │   ├── handlers.ts   # Supabase API mocks
│   │   └── database.ts   # Mock database helpers
│   └── setup.ts          # Vitest setup file
├── database/             # PostgreSQL/pgTAP tests
│   ├── 01_rls_policies.sql    # RLS isolation tests
│   ├── 02_financial_functions.sql # Accounting function tests
│   └── 03_integration_tests.sql  # Integration tests
└── e2e/                 # Playwright E2E tests
    └── example.spec.ts   # Critical flow tests
```

## Running Tests

### Unit Tests (Vitest)
```bash
# Run all unit tests
npm run test:unit

# Watch mode for development
npm run test:watch

# With coverage
npm run test:coverage
```

### E2E Tests (Playwright)
```bash
# Install browsers (first time only)
npx playwright install --with-deps

# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run headed (see browser)
npm run test:e2e:headed
```

### Database Tests (pgTAP)
```bash
# Requires Supabase local or test instance
psql -h localhost -U postgres -d test_avenize < tests/database/01_rls_policies.sql
```

## Test Categories

### Critical Tests (Failing - Need Fix)
These tests document broken functionality. They SHOULD fail until fixed:

- **Dashboard** - Uses hardcoded demo data
- **CRM/Deals** - No database persistence
- **Tasks** - No database persistence
- **Webhooks** - Edge Function not deployed
- **Automations** - Edge Function not deployed
- **Campaigns** - Email sending not implemented
- **2FA** - TOTP verification needs server-side implementation

### Passing Tests
- Auth/TOTP generation
- Currency formatting
- Login page renders correctly
- PWA manifest validation

## CI Pipeline

See `.github/workflows/ci.yml` for the CI configuration:

1. **Type Check** - TypeScript compilation
2. **Unit Tests** - Vitest with coverage
3. **Database Tests** - pgTAP against test Postgres (requires Supabase)
4. **Build** - Vite production build
5. **E2E Tests** - Playwright (on PRs and nightly)

## Adding Tests

### Unit Tests
Create a new `.test.ts` file in `tests/frontend/lib/`:

```typescript
import { describe, it, expect } from 'vitest'

describe('My Feature', () => {
  it('does something', () => {
    expect(true).toBe(true)
  })
})
```

### E2E Tests
Add to `tests/e2e/example.spec.ts`:

```typescript
test('my feature works', async ({ page }) => {
  await page.goto('/app/my-feature')
  // ...
})
```

### Database Tests
Add SQL to `tests/database/`:

```sql
SELECT lives_ok(
  'INSERT INTO my_table ...',
  'Can insert into my_table'
);
```

## Mocking

MSW (Mock Service Worker) is configured to intercept Supabase API calls in tests.

Edit `tests/frontend/mocks/handlers.ts` to customize mocks.
