# Avenize - The Business Operating System

Everything. Together. A unified platform for modern business management.

## Features

### Core Modules
- **CRM** - Deals pipeline, contacts management
- **Tasks** - Task management with assignees and due dates
- **Projects** - Project tracking and milestones
- **Finance** - Invoices, payments, expense tracking
- **Inventory** - Product catalog, stock management
- **Accounting** - Double-entry bookkeeping, balance sheets
- **People** - Team management, invites, roles

### Communication
- **Chat** - Real-time team messaging with channels
- **Knowledge Base** - Internal wiki and documentation
- **Notifications** - Real-time in-app notifications

### Automation
- **Automations** - Visual workflow builder
- **Webhooks** - Event-driven integrations (17+ events)
- **API** - Full REST API with API keys

### Marketing & Sales
- **Social Media** - Post scheduling and branding
- **Email Campaigns** - Drip sequences and analytics
- **Customer Portal** - Client self-service portal

### Enterprise Features
- **SSO/SAML** - Okta, Azure AD, Google Workspace
- **2FA** - Two-factor authentication
- **Custom Branding** - White-label with colors and logo
- **Multi-language** - 10 languages including RTL
- **Audit Logging** - Complete activity tracking
- **PWA** - Installable as mobile app

## Stack
- Vite + React + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Row-Level Security, Auth)
- Vercel deployment

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` with your Supabase credentials
3. Run migrations in `supabase/migrations/`
4. `npm run dev`

## Deploying

See [DEPLOY.md](DEPLOY.md) for detailed instructions.

Quick deploy:
```bash
vercel --prod
```

## Pages

| Module | URL | Description |
|--------|-----|-------------|
| Dashboard | `/` | Home screen |
| CRM | `/crm` | Deals & contacts |
| Chat | `/chat` | Team messaging |
| Tasks | `/tasks` | Task management |
| Calendar | `/calendar` | Events & meetings |
| Projects | `/projects` | Project tracking |
| Finance | `/finance` | Invoices & billing |
| Accounting | `/accounting` | Double-entry bookkeeping |
| Inventory | `/inventory` | Stock & products |
| People | `/people` | Team & invites |
| Knowledge | `/knowledge` | Docs & wiki |
| Automations | `/automations` | Workflow builder |
| Tickets | `/tickets` | Support desk |
| Campaigns | `/campaigns` | Email marketing |
| Reports | `/reports` | Analytics |
| Branding | `/branding` | Colors, logo, theme |
| Security | `/security` | 2FA, audit log |
| SSO | `/sso` | SAML/OIDC setup |
| API | `/api` | API keys, webhooks |
| Portal | `/portal` | Client access |

## Database

**19 migration files** with **60+ tables** covering all modules.

## License

Private - All rights reserved
