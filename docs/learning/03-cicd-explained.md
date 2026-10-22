# The CI/CD pipeline, line by line

Open `.github/workflows/ci.yml` and `cd.yml` next to this file. If you can explain every block below, you can explain GitHub Actions in any interview.

## GitHub Actions vocabulary

| Term | Meaning | Here |
|---|---|---|
| **Workflow** | a YAML file in `.github/workflows/` | `ci.yml`, `cd.yml` |
| **Event / trigger** (`on:`) | what starts it | `pull_request`, `push`, `workflow_run`, `workflow_dispatch` |
| **Job** | a group of steps on one machine; jobs run in parallel unless `needs:` | `web`, `python`, `infra`, `security`, `ci-ok`, `deploy` |
| **Step** | one command or one `uses:` action | `run: npm ci` |
| **Runner** | the machine (`runs-on: ubuntu-latest`) | GitHub-hosted VM, thrown away after the job |
| **Action** (`uses:`) | reusable step written by others | `actions/checkout@v4`, `setup-node@v4` |
| **Artifact** | files produced by a job, kept for later jobs/runs | `portal-site` |
| **Secret / variable** | encrypted / plain config | `DEPLOY_SSH_KEY` / `DEPLOY_HOST` |
| **Environment** | a named deploy target with its own secrets/rules/approvals | `pre-production` |
| **Concurrency** | limit simultaneous runs | `ci-${{ github.ref }}`, `deploy-pre-production` |

## ci.yml walkthrough

```yaml
on:
  pull_request:
  push: { branches: [main] }
  workflow_dispatch:
```
Runs on every PR (to catch problems *before* merge), on every push to main (the result CD depends on) and manually.

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```
A new push to the same branch cancels the older run - no wasted minutes on outdated code.

```yaml
permissions:
  contents: read
```
**Least privilege for the workflow token** (`GITHUB_TOKEN`): read-only unless a job needs more. A frequent interview point.

### Job `web` - lint, test, build, artifact
1. `actions/checkout@v4` - get the code.
2. `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: npm` - the Node version lives in one file (`.nvmrc`), shared by developers and CI; npm downloads are cached.
3. `npm ci` - installs **exactly** what `package-lock.json` says (faster and reproducible, unlike `npm install` which may update the lock).
4. `npm run lint`, `npm test` - fail fast on style errors and logic regressions.
5. *Provide the demo sign-in config* - writes the secret into a git-ignored file only on the runner; warns (does not fail) if missing.
6. `bash infra/deploy/build-site.sh` - builds both apps, assembles `site/`, writes `revision.json`, tars it.
7. `upload-artifact` - stores `portal-*.tar.gz` for 14 days; **this exact file is what CD will deploy.**

### Job `python` - pytest for the data scripts (`allotment.categorize`).

### Job `infra` - tests the *infrastructure files*
* **ShellCheck** (`--severity=warning`) finds shell bugs (unquoted variables, etc.).
* **nginx -t in a container with the same nginx version as the server (1.18)** - a broken config would otherwise only be found during deployment.
* **actionlint** validates the workflow YAML itself (typos in expressions, wrong inputs).

### Job `security`
* `fetch-depth: 0` - gitleaks must see the **whole history**, not just the last commit (a secret deleted later is still in history).
* gitleaks scans for committed secrets. `npm audit --omit=dev --audit-level=high` checks the dependencies that *ship to users*; dev-only tooling is reported but not blocking.

### Job `ci-ok` - one required check
```yaml
needs: [web, python, infra, security]
if: always()
```
Branch protection can require just **"CI passed"**. `if: always()` makes it run even when a needed job failed, so it can report red (otherwise it would be *skipped*, and GitHub treats skipped required checks as passing in some setups - a classic trap).

## cd.yml walkthrough

```yaml
on:
  workflow_run: { workflows: [CI], types: [completed], branches: [main] }
  workflow_dispatch: { inputs: { action: deploy|rollback, release: ... } }
```
CD starts **after CI finished on main** (so it never deploys unverified code) or manually.

```yaml
if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
```
`workflow_run` fires for *any* conclusion - you must check it was `success`.

```yaml
concurrency: { group: deploy-pre-production, cancel-in-progress: false }
```
Queue deployments; **never cancel a half-finished one**.

```yaml
environment: { name: pre-production, url: ${{ vars.PUBLIC_URL }} }
```
Gives the run a deployment record and URL in GitHub, and is where approvals/environment secrets would attach for production.

Steps:
1. **checkout** the *same commit* CI tested (`workflow_run.head_sha`).
2. **find the CI run** (from the event, or the latest successful main run when started manually).
3. **download-artifact** with `run-id` - gets the artifact built by *that* run (needs `actions: read`).
4. **Configure SSH** - writes the key (from a secret) to a file with mode 600 and pins the server identity from `DEPLOY_KNOWN_HOSTS` (`StrictHostKeyChecking=yes` protects against man-in-the-middle).
5. **Deploy** - `deploy.sh --artifact ...` (nothing is rebuilt).
6. **Roll back** (manual only) - `rollback.sh`.
7. **Remove the key** - `if: always()` so cleanup runs even after a failure.

## What `deploy.sh` -> `remote-activate.sh` adds (the part interviewers love)

```
lock (flock) ─► unpack to a NEW folder ─► install nginx conf only if changed (backup first)
   ─► nginx -t ──fail──► restore conf, leave live site untouched, exit 1
   ─► atomic switch (mv -T) ─► reload ─► check on the server itself ──fail──► switch back + restore conf
   ─► prune old releases (never live/previous) ─► public smoke test (from the runner) ──fail──► rollback.sh
```
Layers of defence: **validate before change**, **atomic change**, **verify after change**, **automatic undo**.

## Design questions - think about your answers

1. *Why `workflow_run` instead of putting deploy in `ci.yml`?* Separation: CI can run on forks/PRs with no secrets; CD runs only on main with secrets and an environment. (A `needs:` job in one file is also valid and simpler - know both.)
2. *Why not build on the server?* Disk is 98% full and shared, no toolchain wanted there, and we want to ship the tested artifact.
3. *What if two merges happen quickly?* The CD concurrency group queues them; the second deploys the later artifact.
4. *What if GitHub cannot reach the server?* Allow runner IP ranges, or use a self-hosted runner inside the network (documented in `docs/github-setup.md`).
5. *How would you add production?* New environment with required reviewers, reuse the same artifact, deploy via the load balancer with a hostname and TLS, add a canary/blue-green step.
6. *How would this look with Docker/Kubernetes?* Build an image in CI, push to a registry, deploy by changing the image tag (Helm/Argo CD), rollback = previous tag. Same principles: immutable artifact, health checks, automatic rollback.

## Alternatives (know one sentence about each)
* **GitLab CI** - same ideas, `.gitlab-ci.yml`, built-in registry/environments.
* **Jenkins** - self-hosted automation server, plugin-heavy, Groovy `Jenkinsfile`; more control, more maintenance.
* **Argo CD / Flux** - GitOps: the cluster pulls desired state from git instead of CI pushing.
* **Push vs pull deployment:** we *push* over SSH (simple); GitOps *pulls* (no inbound access needed, better audit).
