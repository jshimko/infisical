<!--
Last updated: 2026-04-28
Current commit: 14d6a22551458325b1b421708c3a679b6cc167d3
-->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

Run from the repository root unless noted otherwise:

- `make reviewable-api` / `make reviewable-ui` — `lint:fix` + `type:check` for the respective package (run before PRs)
- `make reviewable` — runs both of the above
- `make up-dev` — bring up the local dev stack (PostgreSQL, Redis, backend, frontend, Nginx) via `docker-compose.dev.yml`
- `make up-dev-ldap` / `make up-dev-sso` / `make up-dev-metrics` — same dev stack with the `ldap`, `sso`, or `metrics` Compose profile enabled
- `make up-prod` — local boot of `docker-compose.prod.yml` for prod-mode testing
- `make down` — tear the dev stack down

Backend-only utilities (run from `backend/`):

- `npm run migration:new` — create a new DB migration
- `npm run generate:schema` — regenerate Zod types from the DB after migration changes

Node version is pinned to **Node 22** via `.nvmrc`. Both backend and frontend use `@app/*` as a path alias to `./src/*`.

## Repository Structure

Infisical is an open-source secret management platform. Monorepo layout:

```
infisical/
├── backend/                              # Fastify 4 API server (see backend/CLAUDE.md)
├── frontend/                             # React 18 SPA (see frontend/CLAUDE.md)
├── docs/                                 # Mintlify documentation site
├── helm-charts/                          # Helm charts for Kubernetes self-hosting
│   ├── infisical-standalone-postgres/    # Standalone deployment with bundled Postgres/Redis
│   └── infisical-gateway/                # Gateway deployment for private network access
├── cloudformation/ec2-deployment/        # AWS CloudFormation template for EC2 deployment
├── docker-swarm/                         # Docker Swarm stack + HAProxy config
├── nginx/                                # nginx configs (dev + prod reverse proxy)
├── sink/                                 # Auxiliary test infrastructure (oidc-server, redis-cluster,
│                                         #   redis-sentinel, cassandra, coturn, mssql/oracle helpers)
├── docker-compose.dev.yml                # Local dev (PostgreSQL, Redis, backend, frontend, Nginx)
├── docker-compose.dev-read-replica.yml   # Dev variant with a Postgres read replica
├── docker-compose.prod.yml               # Production deployment stack
├── docker-compose.bdd.yml                # BDD testing environment
├── docker-compose.e2e-dbs.yml            # E2E test databases (Oracle, SAP, Snowflake, etc.)
├── Dockerfile.standalone-infisical       # Standalone image (frontend + backend)
├── Dockerfile.fips.standalone-infisical  # FIPS-compliant standalone image
├── Makefile                              # Convenience targets for dev/build/lint
├── render.yaml                           # Render.com blueprint
├── otel-collector-config.yaml            # OpenTelemetry collector (used by `metrics` profile)
├── prometheus.dev.yml                    # Prometheus scrape config (used by `metrics` profile)
├── .github/                              # CI workflows, PR template
└── CLAUDE.md                             # This file
```

- **`backend/`** — Fastify 4 API server, TypeScript, PostgreSQL via Knex, BullMQ queues. See [`backend/CLAUDE.md`](backend/CLAUDE.md) for architecture, patterns, and commands.
- **`frontend/`** — React 18 SPA, Vite 6, TanStack Router + React Query, Tailwind CSS v4. See [`frontend/CLAUDE.md`](frontend/CLAUDE.md) for architecture, patterns, and commands.
- **`docs/`** — Product documentation site. Has its own Dockerfile for building. Reference docs for up-to-date feature descriptions and API usage.

Enterprise features live in `backend/src/ee/` (services and routes), registered before community routes so they can override/extend them.

### Self-Hosted Deployment

Infisical supports several self-hosted deployment shapes. Pick the one that matches the target environment, but be aware that backend changes need to work across all of them:

- **`Dockerfile.standalone-infisical`** — single-container image with both frontend and backend; the workhorse for simple deployments.
- **`Dockerfile.fips.standalone-infisical`** — FIPS 140-2 compliant variant for regulated environments. **Anything you add must remain FIPS-compliant** — this is the practical constraint that gates new backend dependencies and crypto code.
- **`docker-compose.prod.yml`** — production Compose stack with backend, PostgreSQL, and Redis; useful for VM-style hosts.
- **`helm-charts/infisical-standalone-postgres/`** — primary Kubernetes deployment chart. Bundles Infisical core with Postgres and Redis subcharts and ships its own `values.yaml`, `CHANGELOG.md`, and `README.md`. Released via the `helm-release-infisical-core` GitHub Actions workflow.
- **`helm-charts/infisical-gateway/`** — separate chart for deploying the Infisical Gateway, used for private-network secret access without exposing Infisical itself to the network being protected. Released via the `release_helm_gateway` workflow.
- **`cloudformation/ec2-deployment/`** — AWS CloudFormation template for one-click EC2 deployment.
- **`docker-swarm/`** — Docker Swarm `stack.yaml` + HAProxy config for Swarm deployments.
- **`render.yaml`** — Render.com blueprint.

New backend dependencies should be evaluated carefully — they affect container size, FIPS compliance, and the encryption boundary. Check `docs/` for self-hosted deployment documentation when in doubt.

### Dependency Policy

Both `backend/` and `frontend/` enforce a minimum release age of 7 days for npm packages (configured via `.npmrc` in each directory). This means `npm install` will only resolve package versions published at least 7 days ago, as a supply-chain security measure.

### Top-Level Tooling

Small but real things at the repo root that influence local work:

- `.nvmrc` — Node 22; what `nvm use` will pick up.
- `.husky/` — Husky pre-commit hooks; the root `package.json`'s only meaningful script is `husky install`.
- `.envrc` + `flake.nix` — optional Nix dev shell via direnv. Note: the flake currently pins `nodejs_20` while `.nvmrc` pins 22 — if you use the Nix shell, override Node yourself or fall back to nvm to match what CI builds against.
- Root `package.json` — carries only Husky and a few `overrides` for transitive deps; the real package manifests live in `backend/` and `frontend/`.
- `cypress.config.js` — legacy Cypress config with no active suite. Don't add to it; new e2e coverage belongs in `backend/e2e-test/`.
- `otel-collector-config.yaml`, `prometheus.dev.yml`, `servers.json` — used by the `make up-dev-metrics` Compose profile (OTel + Prometheus + pgAdmin).

## Cross-Cutting Patterns

### Auth & Permissions

Auth modes (JWT, IDENTITY_ACCESS_TOKEN, SCIM_TOKEN, MCP_JWT) are extracted in `backend/src/server/plugins/auth/`. Authorization uses CASL (`@casl/ability`) with project-level and org-level permission checks — see `backend/CLAUDE.md` for backend details and `frontend/CLAUDE.md` for frontend permission hooks/HOCs. Note: `API_KEY` and `SERVICE_TOKEN` auth modes are deprecated — do not use them in new code.

### Service Factory + Manual DI (Backend)

No IoC container. Every service is a factory function with explicit dependencies. The entire dependency graph is wired in `backend/src/server/routes/index.ts` — see `backend/CLAUDE.md` for the full wiring map and patterns.

### API Layer (Frontend)

React Query + Axios with query key factories per domain. Each API domain in `frontend/src/hooks/api/` has `queries.tsx`, `mutations.tsx`, and `types.tsx` — see `frontend/CLAUDE.md` for conventions.

## Keeping CLAUDE.md Up to Date

When making significant changes to the codebase (new services, architectural shifts, new patterns, major refactors), update the relevant CLAUDE.md file(s) with high-level findings. This includes this root file for cross-cutting concerns, `backend/CLAUDE.md` for backend changes, and `frontend/CLAUDE.md` for frontend changes. The goal is to keep these files accurate as living documentation so future sessions start with correct context.

## Wiring a New Full-Stack Feature

1. **Backend**: Create service module, migration, wire DI, add routes — see checklist in `backend/CLAUDE.md`
2. **Frontend**: Add API hooks in `src/hooks/api/<domain>/`, create page/view, wire route — see `frontend/CLAUDE.md` for routing and component patterns
3. Run `make reviewable-api` and `make reviewable-ui` (or `make reviewable`) before submitting
