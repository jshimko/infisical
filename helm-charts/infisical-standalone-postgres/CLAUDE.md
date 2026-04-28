<!--
Last updated: 2026-04-28
Current commit: 14d6a22551458325b1b421708c3a679b6cc167d3
Branch: self-hosting-fork
-->

# CLAUDE.md — `helm-charts/infisical-standalone-postgres/`

Guidance for AI coding agents working on this Helm chart.

## Purpose

Helm chart that deploys a self-hosted Infisical instance plus its data plane (PostgreSQL via CloudNativePG, Redis via the opstree Redis operator) on Kubernetes. Used by the `pianobase` self-hosted deployment and published to Cloudsmith as an OCI chart via `helm-charts/upload-infisical-core-helm-cloudsmith.sh`.

## ⚠️ Critical: This Fork Has Diverged From Upstream

If you read the README or CHANGELOG, **do not trust them** — they still describe upstream behavior. The fork (`self-hosting-fork`) made these breaking changes:

- **`Chart.yaml` has no `dependencies:` section.** Upstream lists `bitnami/postgresql`, `bitnami/redis`, and `ingress-nginx` as subcharts. This fork removed all three (commit `fba4d40fdc` "replace Bitnami charts with PG/Redis Operator deployments").
- **PostgreSQL is provisioned via the CloudNativePG (CNPG) operator.** Configured under `cnpg.*` in `values.yaml`. The chart renders `kind: Cluster` (`postgresql.cnpg.io/v1`) — it does **not** spin up Postgres pods directly. The CNPG operator must already be installed in the cluster.
- **Redis is provisioned via the opstree Redis operator.** Renders `kind: Redis` (`redis.redis.opstreelabs.in/v1beta2`). The opstree Redis operator must already be installed in the cluster.
- **`postgresql.*` and `redis.architecture/auth/...` keys from upstream are gone.** Only `redis.enabled`, `redis.name`, `redis.kubernetesConfig`, `redis.storage`, plus the `cnpg.*` tree are honored. Setting upstream-style keys silently does nothing.
- **`ingress-nginx` subchart is no longer bundled** but the `values.yaml` still has an `ingress-nginx:` block (used only when someone adds the subchart back). The bundled controller path is effectively a no-op in this fork.

When upstream `main` is merged in, expect conflicts in `Chart.yaml`, `values.yaml`, `templates/infisical.yaml`, and `README.md`. Always preserve the operator-based wiring.

## Critical Constraints

- **Never re-add the Bitnami subchart dependencies to `Chart.yaml`** unless the user is intentionally reverting to upstream. The CNPG/opstree path is the contract self-hosters depend on.
- **Never change how `DB_CONNECTION_URI` is built.** The Deployment imports the CNPG-generated secret `{{ .Values.cnpg.cluster.name }}-postgres-app` (key `uri`) into `CNPG_URI`, then sets `DB_CONNECTION_URI = "$(CNPG_URI){{ .Values.cnpg.dbUrlOptions }}"`. The default `dbUrlOptions: "?schema=infisical"` matters — Infisical expects a specific schema and the CNPG `Database` resource creates a schema with that name owned by the database user.
- **Bump `Chart.yaml` `version:` on every chart change** (SemVer) and add a CHANGELOG entry. CI publishes to Cloudsmith based on this version.
- **Keep startup probe failure window long.** `infisical.startupProbe.failureThreshold: 300` with `periodSeconds: 1` — that's 5 minutes (commit `ed55add791`). Newer Infisical releases run DB migrations during startup; shorter windows cause crash loops on first install.
- **Do not introduce dependencies that break FIPS compliance** for the underlying Infisical image — see root `CLAUDE.md` "Self-Hosted Deployment".
- **Do not add raw secret values to `values.yaml`** (no SMTP/AUTH_SECRET defaults). All secrets flow through `kubeSecretRef` (default: `infisical-secrets`) and `envFrom`.

## Architecture

```
                ┌─────────────────────────┐
                │  Helm release (this)    │
                └────────────┬────────────┘
                             │ renders
        ┌────────────────────┼────────────────────────┐
        │                    │                        │
┌───────▼────────┐  ┌────────▼─────────┐    ┌─────────▼──────────┐
│ Deployment +   │  │ CNPG: Cluster +  │    │ opstree Redis CRD  │
│ Service        │  │ Database +       │    │ (kind: Redis)      │
│ (Infisical)    │  │ ObjectStore +    │    │                    │
│                │  │ ScheduledBackup +│    │                    │
│                │  │ Pooler (opt)     │    │                    │
└───────┬────────┘  └────────┬─────────┘    └─────────┬──────────┘
        │                    │                       │
        │           ┌────────▼─────────┐    ┌────────▼──────────┐
        │           │ CNPG operator    │    │ ot-redis-operator │
        │           │ (cluster-wide)   │    │ (cluster-wide)    │
        │           └──────────────────┘    └───────────────────┘
        │
   ┌────▼─────────────────────────┐
   │ Ingress (nginx by default)   │
   │ /  → infisical:8080          │
   │ /ss-webhook → infisical:8080 │
   └──────────────────────────────┘

  Optional: post-install Job runs `infisical bootstrap` CLI
  (templates/bootstrap-job.yaml) when infisical.autoBootstrap.enabled=true
```

### Required cluster prerequisites

These are _not_ installed by this chart and the chart will fail to come healthy without them:

- **CloudNativePG operator** — provides `postgresql.cnpg.io/v1` CRDs (`Cluster`, `Database`, `Pooler`, `ScheduledBackup`).
- **CloudNativePG Barman Cloud plugin** — required only when `cnpg.backups.enabled=true`. Provides `barmancloud.cnpg.io/v1` `ObjectStore`.
- **opstree Redis operator (ot-container-kit/redis-operator)** — provides `redis.redis.opstreelabs.in/v1beta2` `Redis`.
- **An ingress controller** (nginx assumed by default `ingressClassName`).
- **A pre-created `Secret` named per `infisical.kubeSecretRef`** (default `infisical-secrets`) containing at minimum `AUTH_SECRET`, `ENCRYPTION_KEY`, `SITE_URL`. CI workflow shows the canonical create command.

## Directory Structure

```
infisical-standalone-postgres/
├── Chart.yaml              # version + appVersion (no dependencies in fork)
├── values.yaml             # defaults — see "Values Schema" below
├── README.md               # ⚠️ STALE — describes upstream Bitnami subcharts
├── CHANGELOG.md            # ⚠️ Mixes upstream and fork entries
└── templates/
    ├── _helpers.tpl        # naming + labels
    ├── infisical.yaml      # Deployment + Service for Infisical app
    ├── ingress.yaml        # k8s 1.18+ uses ingressClassName
    ├── jobs-rbac.yaml      # ServiceAccount + Role + RoleBinding
    ├── bootstrap-job.yaml  # post-install Helm hook for `infisical bootstrap`
    ├── extra.yaml          # renders `extraTemplates` via tpl
    ├── redis.yaml          # opstree Redis CRD
    ├── NOTES.txt           # post-install banner
    └── postgres/
        └── cluster.yaml    # CNPG Cluster + Database + Pooler + ObjectStore + ScheduledBackup
```

## Values Schema (canonical)

The values that actually do something in this fork:

| Key                                                                                                                      | Default                                                                                                              | Purpose                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `nameOverride`, `fullnameOverride`                                                                                       | `""`                                                                                                                 | Standard Helm name overrides                                                                                  |
| `infisical.enabled`                                                                                                      | `true`                                                                                                               | Toggle the Infisical Deployment + Service                                                                     |
| `infisical.replicaCount`                                                                                                 | `2`                                                                                                                  | Pod replicas                                                                                                  |
| `infisical.image.repository` / `.tag` / `.pullPolicy`                                                                    | `infisical/infisical` / `latest` / `IfNotPresent`                                                                    | Container image                                                                                               |
| `infisical.image.imagePullSecrets`                                                                                       | `[]`                                                                                                                 | For private registries                                                                                        |
| `infisical.kubeSecretRef`                                                                                                | `infisical-secrets`                                                                                                  | `envFrom.secretRef` — must contain `AUTH_SECRET`, `ENCRYPTION_KEY`, `SITE_URL` at minimum                     |
| `infisical.env`                                                                                                          | `[]`                                                                                                                 | Extra inline env entries (appended after DB/Redis vars)                                                       |
| `infisical.envFrom`                                                                                                      | `[]`                                                                                                                 | Extra `envFrom` (e.g. SMTP secret)                                                                            |
| `infisical.extraEnv`                                                                                                     | `[]`                                                                                                                 | (legacy field name, still in values; prefer `infisical.env` — see Gotchas)                                    |
| `infisical.startupProbe` / `readinessProbe` / `livenessProbe`                                                            | see file                                                                                                             | Don't shorten startup window — see Critical Constraints                                                       |
| `infisical.serviceAccount.{create,name,annotations}`                                                                     | `{create:true}`                                                                                                      | Per-release SA `{Release.Name}-infisical` with Role for jobs/secrets                                          |
| `infisical.autoBootstrap.enabled`                                                                                        | `false`                                                                                                              | Run `infisical bootstrap` CLI as a post-install Job                                                           |
| `infisical.autoBootstrap.organization`                                                                                   | `default-org`                                                                                                        | Org name created during bootstrap                                                                             |
| `infisical.autoBootstrap.credentialSecret.name`                                                                          | `infisical-secrets`                                                                                                  | Secret with `INFISICAL_ADMIN_EMAIL` / `INFISICAL_ADMIN_PASSWORD`                                              |
| `infisical.autoBootstrap.secretDestination.{name,namespace}`                                                             | `infisical-bootstrap-secret` / release ns                                                                            | Where the bootstrap output secret is written                                                                  |
| `infisical.autoBootstrap.secretTemplate`                                                                                 | `'{"data":{"token":"{{.Identity.Credentials.Token}}"}}'`                                                             | Go-template-driven secret payload from CLI                                                                    |
| `infisical.{volumes,volumeMounts,resources,securityContext,affinity,tolerations,nodeSelector,topologySpreadConstraints}` | standard                                                                                                             | Pod scheduling/customization                                                                                  |
| `infisical.service.{type,port,targetPort,nodePort}`                                                                      | `ClusterIP` / `8080` / `8080`                                                                                        | Service exposure                                                                                              |
| `ingress.enabled`                                                                                                        | `true`                                                                                                               | Render the `Ingress`                                                                                          |
| `ingress.hostName`                                                                                                       | `""`                                                                                                                 | Optional `host:` rule (single host only)                                                                      |
| `ingress.ingressClassName`                                                                                               | `""`                                                                                                                 | Falls back to `infisical-nginx` if `ingress.nginx.enabled` else `nginx`                                       |
| `ingress.tls`                                                                                                            | `[]`                                                                                                                 | List of `{secretName, hosts:[]}`                                                                              |
| `cnpg.enabled`                                                                                                           | `true`                                                                                                               | Render the CNPG resources                                                                                     |
| `cnpg.dbUrlOptions`                                                                                                      | `?schema=infisical`                                                                                                  | Appended to CNPG-generated URI                                                                                |
| `cnpg.cluster.name`                                                                                                      | `infisical`                                                                                                          | Becomes `{name}-postgres` cluster + `{name}-postgres-app` secret                                              |
| `cnpg.cluster.spec`                                                                                                      | `{instances:1, bootstrap.initdb:{database:infisical, owner:infisical}, storage:{size:10Gi}, walStorage:{size:10Gi}}` | Passed verbatim to CNPG `Cluster.spec` (toYaml)                                                               |
| `cnpg.pooler.enabled`                                                                                                    | `false`                                                                                                              | PgBouncer via CNPG `Pooler`                                                                                   |
| `cnpg.backups.enabled`                                                                                                   | `false`                                                                                                              | Barman Cloud `ObjectStore` + `ScheduledBackup` (cron)                                                         |
| `cnpg.backups.config`                                                                                                    | `{}`                                                                                                                 | Passed to `ObjectStore.spec.configuration` (S3-compatible: `endpointURL`, `destinationPath`, `s3Credentials`) |
| `redis.enabled`                                                                                                          | `true`                                                                                                               | Render the opstree `Redis` CRD                                                                                |
| `redis.name`                                                                                                             | `infisical-redis`                                                                                                    | Used for the Redis hostname (`REDIS_URL=redis://{name}:6379`)                                                 |
| `redis.kubernetesConfig.{image,resources,...}`                                                                           | opstree image                                                                                                        | Passed to `Redis.spec.kubernetesConfig`                                                                       |
| `redis.storage.volumeClaimTemplate`                                                                                      | 1Gi RWO                                                                                                              | Passed to `Redis.spec.storage`                                                                                |
| `extraManifests`                                                                                                         | `[]`                                                                                                                 | Documented in `values.yaml` but **not currently rendered** by any template — see Gotchas                      |
| `extraTemplates`                                                                                                         | (referenced by `templates/extra.yaml` via `tpl`)                                                                     | Templated extra manifests                                                                                     |

## Wiring: How Infisical Connects to Postgres and Redis

`templates/infisical.yaml` builds `DB_CONNECTION_URI` like this:

```yaml
- name: CNPG_URI
  valueFrom:
    secretKeyRef:
      name: "{{ .Values.cnpg.cluster.name }}-postgres-app" # secret created by CNPG operator
      key: "uri"
- name: DB_CONNECTION_URI
  value: "$(CNPG_URI){{ .Values.cnpg.dbUrlOptions }}" # appends ?schema=infisical
```

- The `{name}-postgres-app` secret is generated by the CNPG operator when it provisions the `Cluster` — it is **not** rendered by this chart.
- The `cnpg.dbUrlOptions` default is `?schema=infisical`. The matching schema is created by the `Database` resource in `templates/postgres/cluster.yaml`, owned by the database user.
- Redis: `REDIS_URL=redis://{{ .Values.redis.name }}:6379` (no auth). Override at the application layer (e.g. via `infisical.env`) only if your operator config exposes one.

## Established Patterns

### Pattern: Naming via `_helpers.tpl`

- Use `{{ include "infisical.fullname" . }}` for the Infisical Deployment/Service (already done in `infisical.yaml`).
- Use `{{ include "infisical.serviceAccountName" . }}` for any pod that needs the chart's SA — both the main Deployment and `bootstrap-job.yaml` use this.
- Labels: `{{ include "infisical.labels" . | nindent 4 }}` for top-level metadata; `{{ include "infisical.matchLabels" . | nindent 6 }}` for `selector.matchLabels` and pod template labels.
- **Don't hand-roll names** — every existing template uses these helpers. New templates should too.

### Pattern: `with` for optional blocks

Existing templates consistently use `{{- with .Values.something }}…{{- end }}` to omit empty maps/lists from rendered YAML. Follow this — Helm `toYaml` of `null`/`{}` produces noisy or invalid output otherwise (commit `50d65c0e18` "fix null labels/annotations").

```yaml
{{- with .Values.infisical.affinity }}
affinity:
  {{- toYaml . | nindent 8 }}
{{- end }}
```

### Pattern: Releases that span namespaces (bootstrap)

`infisical.autoBootstrap.secretDestination.namespace` may differ from `.Release.Namespace`. `templates/jobs-rbac.yaml` creates a _second_ Role/RoleBinding scoped to the destination namespace when bootstrap is enabled. Preserve this — moving the bootstrap secret to a different namespace without that RBAC will fail with permission errors.

### Pattern: ArgoCD-friendly hooks

`templates/bootstrap-job.yaml` carries both Helm hooks (`helm.sh/hook: post-install`, `hook-delete-policy: before-hook-creation`, `ttlSecondsAfterFinished: 300`) **and** Argo CD hooks (`argocd.argoproj.io/hook: PostSync`, `hook-delete-policy: HookSucceeded`) so the chart works under both `helm install` and Argo CD-managed deployments. Keep both sets when adding new hook-style jobs.

### Pattern: CNPG-managed secrets

The chart never creates or hardcodes Postgres credentials. The CNPG operator generates `{cluster.name}-postgres-app` containing `uri`, `username`, `password`, etc. **Always reference these by `secretKeyRef`** rather than templating credentials in plaintext.

### Pattern: `extraTemplates` for site-specific glue

`extraTemplates` is rendered via `tpl` in `templates/extra.yaml` and is the supported escape hatch for one-off additions (cert-manager `Certificate`, ExternalSecrets, etc.) without forking. Prefer it over adding new `templates/*.yaml` files for site-specific resources.

## Making Changes

### Before starting

1. Confirm the change is fork-compatible: does it preserve the operator-based DB/Redis path?
2. Check `CHANGELOG.md` for whether the area you're touching is fork-only or upstream — fork commits don't always show up in CHANGELOG.
3. Read the matching upstream file on `main` (`git show main:helm-charts/infisical-standalone-postgres/<path>`) before editing if you suspect drift.

### During development

- Run `helm template` against representative values to see rendered output:

  ```sh
  cd helm-charts/infisical-standalone-postgres
  helm template test . --set ingress.hostName=test.example.com
  helm template test . --set infisical.autoBootstrap.enabled=true
  ```

- Run `helm lint`:

  ```sh
  helm lint helm-charts/infisical-standalone-postgres
  ```

- For breaking-schema changes, bump `Chart.yaml: version:` (SemVer) and add a `CHANGELOG.md` entry at the top.

### Testing

CI (`.github/workflows/run-helm-chart-tests-infisical-standalone-postgres.yml`) runs on PRs that touch this directory:

1. `ct lint --config ct.yaml --charts helm-charts/infisical-standalone-postgres`
2. Spins up a kind cluster, creates the `infisical-secrets` and `infisical-bootstrap-credentials` Secrets, and runs `ct install` with `ingress.nginx.enabled=false`, `replicaCount=1`, a pinned `infisical.image.tag`, and `autoBootstrap.enabled=true`.

⚠️ The CI install step does **not** install the CNPG or opstree Redis operators in the kind cluster. Tests will fail if you require new CRDs without updating the workflow to install them. This is a known gap on the fork — if you add operator dependencies, also add `helm install` steps for them in the workflow.

To reproduce locally:

```sh
kind create cluster
kubectl apply --server-side -f \
  https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/main/releases/cnpg-1.24.1.yaml
helm install ot-redis-operator ot-helm/redis-operator -n ot-operators --create-namespace
kubectl create namespace infisical-test
kubectl create secret generic infisical-secrets -n infisical-test \
  --from-literal=AUTH_SECRET=$(openssl rand -hex 16) \
  --from-literal=ENCRYPTION_KEY=$(openssl rand -hex 16) \
  --from-literal=SITE_URL=http://localhost:8080
helm install test ./helm-charts/infisical-standalone-postgres -n infisical-test \
  --set ingress.hostName=test.local --set infisical.replicaCount=1
```

### Releasing

`helm-charts/upload-infisical-core-helm-cloudsmith.sh`:

1. `cd infisical-standalone-postgres && helm dependency update && helm package .`
2. `helm push *.tgz oci://helm.oci.cloudsmith.io/infisical/helm-charts`

Requires `CLOUDSMITH_API_KEY` and `CLOUDSMITH_USERNAME` env vars. Note: `helm dependency update` is a no-op in this fork because there are no subchart dependencies.

## Common Tasks

### HOW TO: Add a new value

1. Add the key to `values.yaml` with a `# --` comment (the readme-generator-for-helm parses these).
2. Reference it in the relevant template under `templates/` using `{{- with }}` if optional.
3. If it changes rendered output, bump `Chart.yaml: version:` and add a CHANGELOG entry.
4. Run `helm template` with and without the new value to confirm rendering.
5. README is auto-generated from `values.yaml` (`npm exec readme-generator -- --readme README.md --values values.yaml` per `helm-charts/README.md`) — but the fork's README is already stale; either fix it comprehensively or leave it alone, don't half-update.

### HOW TO: Add a new manifest

- For one-off site-specific additions: prefer `extraTemplates` in values rather than adding a template file.
- For fork-wide additions: add `templates/<name>.yaml`, gate on a `.Values.<feature>.enabled` flag, use `_helpers.tpl` for naming, follow the `{{- with }}` pattern for optional fields.

### HOW TO: Bump the Infisical image version

- Edit `infisical.image.tag` in `values.yaml`.
- Bump `Chart.yaml: appVersion`.
- Bump `Chart.yaml: version` (patch — image bump alone is not a chart contract change).
- Add a `CHANGELOG.md` entry.

### HOW TO: Add a new operator dependency

- Document the prerequisite in this CLAUDE.md and in `README.md`.
- Add it to the CI workflow (`.github/workflows/run-helm-chart-tests-infisical-standalone-postgres.yml`) before the `ct install` step, otherwise CI will fail on missing CRDs.
- Reference operator-managed secrets via `secretKeyRef` rather than templating credentials.

### HOW TO: Debug a failed install

1. `kubectl describe deployment {release}-infisical -n {ns}` — check container envs and image pull.
2. `kubectl logs deployment/{release}-infisical -n {ns}` — Infisical logs.
3. `kubectl get cluster.postgresql.cnpg.io -n {ns}` — CNPG cluster status; `kubectl describe` for events.
4. `kubectl get redis.redis.redis.opstreelabs.in -n {ns}` — opstree Redis status.
5. `kubectl get jobs -n {ns}` — `{release}-bootstrap-{rev}` is the bootstrap job; check its logs if `autoBootstrap.enabled`.
6. The 5-minute startup window means initial migration appears as "not ready" for several minutes — wait before assuming a probe failure is real.

## Gotchas & Tribal Knowledge

- **README.md and CHANGELOG.md are partially stale.** They describe upstream Bitnami subcharts and `postgresql.auth.*` / `redis.auth.*` fields that no longer exist. Treat `values.yaml` as the source of truth.
- **`infisical.extraEnv` is documented but unused.** The `values.yaml` defines it, but `templates/infisical.yaml` does not render it (only `infisical.env` is rendered). Use `infisical.env`. Likely a merge artifact — fix forward only if you also remove the dead key from `values.yaml`.
- **`extraManifests` is documented but unused.** `values.yaml` describes it, but no template in this fork renders it. `extraTemplates` (rendered by `templates/extra.yaml` via `tpl`) is the working escape hatch.
- **CHANGELOG entries above 1.7.0 are upstream-style.** The actual fork-divergence (Bitnami → operators) is not called out in CHANGELOG — it lives only in commit history (`fba4d40fdc`).
- **`ingress-nginx:` block in `values.yaml` is vestigial** unless someone re-adds the subchart dependency. Don't waste time tuning it; the `ingress.ingressClassName` fallback (`infisical-nginx` vs `nginx`) is what actually controls routing class.
- **`infisical.autoDatabaseSchemaMigration` is gone** (CHANGELOG 1.7.2). Newer Infisical versions migrate on startup. The `databaseSchemaMigrationJob.image` field still exists in `values.yaml` but no template references it in this fork.
- **Probes hit `/api/status`** on container port 8080; the long startup probe is intentional (commit `ed55add791`).
- **Backup target path collision.** `cnpg.backups.config.destinationPath` must be unique per-cluster in object storage. CNPG `Cluster.name` is `{cnpg.cluster.name}-postgres` (not just `cnpg.cluster.name`).
- **The `Database` CRD requires a separate name from the Cluster.** `cluster.yaml` uses `metadata.name: {{ .Values.cnpg.cluster.name }}` for `Database` and `{name}-postgres` for `Cluster` — don't unify these.

## Historical Context

Why operators instead of Bitnami subcharts? (commit `fba4d40fdc`) The fork prioritizes:

- **HA Postgres with managed failover, point-in-time recovery, and S3 backups** — CNPG provides these out of the box.
- **Fewer secrets to manage** — CNPG generates and rotates connection secrets.
- **GitOps-friendliness** — operator CRDs reconcile continuously; Bitnami subcharts on Helm 3 require manual migration paths for major upgrades.

The trade-off is that operator CRDs must already exist in the cluster, and the chart is no longer self-contained.
