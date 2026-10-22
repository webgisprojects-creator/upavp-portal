# Interview question bank

**How to use:** read the question, **answer aloud**, then compare. The answers are model answers - rewrite them in your own words, and always add
*"in my project..."* with a real example. Questions marked **(trap)** are commonly used to test depth.

---
## 1. Git and team workflow

**1. Why not commit directly to `main`?**
Direct commits skip review and CI, and a broken commit blocks everyone. With PRs, CI checks run first, a teammate reviews, history stays clean, and `main` stays deployable. *(Project: CONTRIBUTING.md; branch protection described in github-setup.md.)*

**2. Merge vs rebase vs squash?**
*Merge* keeps all commits plus a merge commit. *Rebase* replays your commits on top of the target for a linear history (never rebase shared branches). *Squash* turns the PR into one commit - clean history, easy to revert. We squash-merge.

**3. What is a merge conflict and how do you resolve it?**
Two branches changed the same lines. Git marks conflicts; you edit to the correct result, `git add`, continue. Prevent them with small, short-lived branches and frequent syncs with `main`.

**4. How do you undo a bad commit that is already on `main`?**
`git revert <sha>` (creates an opposite commit; safe for shared history). `git reset --hard` rewrites history - not on shared branches. In our setup the quicker production fix is the pipeline's **rollback** to the previous release, then revert in a PR.

**5. What belongs in `.gitignore`? (trap)** Build output, dependencies, local env files and secrets. Mention that adding a file to `.gitignore` does **not** remove it from history if it was already committed - you must rotate the secret and rewrite history.

**6. What is a good commit message?** Imperative, scoped, explains *why*: `fix(login): stop sign-in when no users are configured` (Conventional Commits).

**7. Monorepo vs multi-repo?**
Monorepo: one repo, shared tooling, atomic changes across apps (login + dashboard deploy together). Cost: bigger repo, need path-aware CI as it grows. We use npm workspaces.

**8. What is a protected branch?** Rules on `main`: PR required, status checks must pass, approvals, no force-push. (Note: on a free private repo these need a paid plan - otherwise it is a team convention.)

---
## 2. CI/CD and GitHub Actions

**9. Explain CI and CD in one breath.** CI automatically builds and tests every change; CD automatically releases a verified build. Together: small, safe, frequent releases.

**10. Delivery vs deployment?** Delivery = always releasable, human approves release. Deployment = every green change goes live automatically. We deploy automatically to pre-prod; production would need an approval.

**11. What is an artifact and why "build once"? (trap)**
The packaged build output. Building once and deploying that same file guarantees the tested bits are what run; rebuilding per environment can change dependencies/config. *Caveat:* build-time config (our demo users) is baked in - use runtime config for true multi-environment promotion.

**12. `npm ci` vs `npm install`?** `ci` installs exactly from the lockfile, fails if it is out of sync, is faster and deterministic - correct for CI.

**13. What does `permissions: contents: read` do?** Limits the `GITHUB_TOKEN` to read-only: least privilege so a compromised step cannot push code.

**14. How do you keep secrets safe in Actions?** Store as encrypted secrets (masked in logs), never echo them, scope them to environments, don't expose them to PRs from forks, rotate on leak, and scan with gitleaks. Use OIDC federation instead of long-lived keys where the cloud supports it.

**15. Why `if: always()` on the cleanup and the `ci-ok` job?** So they run even if earlier steps fail: cleanup must delete the SSH key; `ci-ok` must report red rather than being skipped.

**16. `workflow_run` vs `needs`?** `needs` orders jobs inside one workflow. `workflow_run` starts a second workflow after the first finishes - lets CD run only on main, with secrets, separately from PR CI. Remember to check `conclusion == 'success'`.

**17. How do you speed up pipelines?** Dependency caching, parallel jobs, `concurrency` cancel-in-progress for PRs, building once and reusing artifacts, only running what changed.

**18. What is a self-hosted runner and when use it?** A runner you operate inside your network. Use when the target is not reachable from the internet, you need special hardware, or for cost. Trade-off: you secure and patch it.

**19. How would you add a manual approval before production?** A `production` environment with *required reviewers*; the deploy job references it; the job pauses until approved.

**20. How do you test the pipeline itself?** Lint the workflows (actionlint), shellcheck scripts, validate configs (nginx -t) in CI, and keep a safe environment to run the real deploy and a rollback drill.

**21. Matrix builds?** Run one job over several versions/OSes (`strategy.matrix`). Not needed here: single Node version.

**22. Reusable workflows / composite actions?** Share pipeline logic between repos or jobs. Useful when you have several similar services.

---
## 3. Release engineering and reliability

**23. How does your deployment avoid downtime? (trap)** Static files in a new folder, then an **atomic** symlink rename (`mv -T`) and a graceful nginx reload. Visitors always see either the full old or full new release.

**24. What if the new release is broken?** Layers: `nginx -t` before the switch; on-server check after; public smoke test; automatic rollback to the previous release; manual rollback workflow.

**25. Why keep several releases?** Fast rollback without rebuilding. We keep 5 (disk is tight) and never prune the live or previous one.

**26. Blue/green vs canary?** Blue/green: two full environments, flip traffic. Canary: send a small % first and watch metrics. Ours is closest to blue/green for static files. Canary needs traffic splitting and monitoring.

**27. Database migrations and rollback? (trap)** Code rollback is easy; data changes are not. Use backward-compatible migrations (expand -> migrate -> contract), deploy schema before code that needs it, and take a backup first.

**28. What is a smoke test vs a full test?** Smoke = a few fast "is it alive" checks after deploy; full tests run before. Smoke must be reliable, so we made the shared-GeoServer tile check a warning.

**29. What is MTTR and why does rollback matter?** Mean time to recovery. One-click rollback keeps it to seconds, which is more valuable than trying never to fail.

**30. Observability?** Logs, metrics, traces. Today we have nginx logs, `X-Edge-Cache` headers, `revision.json` and smoke tests. Next: uptime monitoring, alerting on 5xx/latency, and centralised logs.

---
## 4. Linux, shell and nginx

**31. What does `set -euo pipefail` do?** `-e` exit on error, `-u` error on unset variables, `-o pipefail` a pipeline fails if any command in it fails. Makes scripts fail loudly instead of continuing in a bad state.

**32. Why quote `"$var"`?** To stop word-splitting and globbing (spaces in paths break unquoted variables). ShellCheck enforces this.

**33. A bug you hit with ssh? (project)** `ssh host bash -s -- "" 0` dropped the empty argument because ssh re-joins arguments into one string, shifting `$1`/`$2`. Fix: quote inside the command string (`"bash -s -- '$A' '$B'"`).

**34. What is `flock` for?** An advisory file lock so two deploys cannot run simultaneously; the second exits immediately (`-n`).

**35. Symlink vs hard link? Why is `mv -T` atomic?** A symlink is a pointer by path. `rename()` is an atomic filesystem operation, so replacing the `current` link in one step leaves no gap, unlike remove-then-create.

**36. What does nginx `try_files $uri $uri/ /index.html` do?** Tries the file, then the directory, then falls back to `index.html` - needed for single-page apps. Side effect: unknown files return 200 HTML, so tests must check content.

**37. Reverse proxy vs forward proxy?** Reverse: sits in front of servers for clients (ours). Forward: sits in front of clients to reach the internet.

**38. How does nginx caching decide what to store? (trap)** It obeys upstream `Cache-Control`/`Expires`. GeoServer sent `no-cache, no-store` for cached tiles, so we used `proxy_ignore_headers` and set our own policy; we also only cache `GetMap` image responses and never errors (`proxy_no_cache`).

**39. `nginx -t` then `reload` vs `restart`?** `-t` validates; `reload` starts new workers gracefully and keeps connections; `restart` drops them.

**40. How would you add HTTPS?** Hostname + certificate (Let's Encrypt/certbot or an organisation CA), `listen 443 ssl`, redirect 80->443, HSTS, modern TLS settings; terminate on the load balancer or nginx.

**41. Find why a service is slow on a Linux box?** `uptime`/`top` (CPU), `free -m` (memory), `df -h` (disk), `ss -ltn` (ports), `journalctl -u`/logs, `curl -w` timings, `ping`/`mtr` for network.

---
## 5. Databases and PostGIS

**42. Least privilege in PostgreSQL? (project)** Owner role with no login; app role with DML only; GeoServer read-only; `REVOKE ... FROM PUBLIC`; per-role connection limits and statement timeouts; default privileges so future tables are covered.

**43. `GRANT` vs `ALTER DEFAULT PRIVILEGES`?** GRANT affects existing objects; default privileges apply to objects a role creates **later**.

**44. Why a connection pooler?** Connections are costly; PgBouncer multiplexes many clients over few connections. Transaction pooling suits short app queries; session pooling suits tools needing session state.

**45. What does a GiST index do?** Spatial R-tree-like index so bounding-box queries (`&&`) don't scan the whole table. Measure with `EXPLAIN (ANALYZE)`.

**46. SRID 4326 vs 3857?** 4326 = lon/lat degrees (good for storage/measurement with geography); 3857 = web mercator metres (what web map tiles use). GeoServer reprojects on the fly.

**47. How do you back up and restore? (be honest)** `pg_dump -Fc` to another host, restore with `pg_restore` to a scratch database to prove it works; for point-in-time recovery use WAL archiving. *In my project backups are a known gap on my roadmap.*

**48. How do you evolve a schema safely?** Numbered migration files reviewed in PRs, additive first, backups, run in staging, avoid long locks on big tables.

**49. SQL injection and CQL injection?** Never concatenate raw input. Our CQL values are quoted with `sqlQuote` (doubles single quotes) and covered by tests; for SQL use parameterised queries.

---
## 6. GIS, GeoServer and performance

**50. WMS vs WFS vs WMTS?** WMS = rendered images on request; WFS = vector features; WMTS = pre-defined tile grid (cache-friendly). We use WMS with `TILED=true` so GeoServer/GWC can serve grid-aligned cached tiles.

**51. How did you find the performance bottleneck? (best story)** Measured each hop: DB query 31 ms; ping GeoServer->DB 250 ms; GeoServer fetches 1,000 rows per round trip, so 172 trips = ~43 s - matching 45 s. Then tried a style optimisation, measured no gain and discarded it.

**52. What would you do next to fix it properly?** Raise JDBC fetch size, run GeoServer near the database, seed the tile cache, use a read-only connection pool (JNDI).

**53. How do tile caches work and what is cache invalidation?** Tiles keyed by layer/style/grid/x/y; invalidate by truncating after data/style changes. "Two hard things in computer science: cache invalidation and naming things" - we use bounded TTLs (2 days server, 1 day browser) and a clear-cache runbook.

**54. Why not load all 172k plots as vector data in the browser?** Payload and rendering cost (tens of MB, slow on mobile) and the 244 ms DB round trips. Raster tiles scale; vector tiles (MVT) would be the next step if the GeoServer extension were installed.

**55. Why minimum zoom for plots?** Too many features to draw usefully at city scale; we show clickable plotted *areas* instead and let users jump to them.

**56. Level of detail / generalisation?** Draw less when zoomed out (scale-dependent styles, simplification). We measured that for this case it did not fix the root cause.

---
## 7. Frontend

**57. How do you keep a large React component maintainable?** Extract pure logic (`lib/cql.js`) and test it; keep side effects in hooks; split UI into small components (LayerTool, LanduseFilter, PlotAllotmentChart).

**58. Why did you disable `hidpi` for WMS tiles? (trap)** On high-DPI screens OpenLayers adds `FORMAT_OPTIONS=dpi:...`, so requests no longer match cached tiles - every tile misses the cache.

**59. How did you make the chart interactive and accessible?** SVG donut with keyboard-focusable slices (`role=button`, `aria-pressed`), hover/focus state, legend rows as buttons, numbers shown next to colours (not colour alone).

**60. Retry logic for tiles?** Custom `tileLoadFunction` using `fetch`, 2 retries with backoff, treats non-image responses as failures, marks the tile failed only after retries.

**61. What is bundle splitting?** Loading code only when needed - the 540 KB landuse labels JSON is a lazy chunk loaded the first time landuse is switched on.

---
## 8. Security

**62. Is your login secure? (trap - be honest)** No - it is a temporary demo check in the browser; anything shipped to a browser is readable. Real fix: backend auth with hashed passwords (argon2/bcrypt), rate limiting/lockout, HttpOnly+Secure+SameSite cookies, HTTPS, audit logging, MFA. It is #1 on my roadmap.

**63. Where do secrets live?** GitHub Secrets / password manager; never in git. CI scans history with gitleaks; `.gitignore` blocks env files.

**64. OWASP Top 10 relevant here?** Broken access control (open dashboard), injection (CQL quoting), security misconfiguration (open DB rule), vulnerable components (npm audit), logging gaps.

**65. How do you harden SSH deploys?** Dedicated key per purpose, restricted user with sudo limited to deploy scripts, pinned `known_hosts`, `StrictHostKeyChecking=yes`, network restrictions, rotate keys.

**66. What is CORS and why did you avoid it?** Browser rule about cross-origin requests; we proxy GeoServer through the same origin, which also hides its admin UI.

**67. Dependency risk?** `npm audit` for runtime deps in CI, Dependabot PRs weekly, lockfile pinned versions.

---
## 9. Testing

**68. What did you test and why those things?** Logic that is easy to get wrong and expensive to debug in production: filter builders (quotes, NULLs, empty lists), data classification of messy text, snapshot integrity (counts add up), auth parsing. Plus infrastructure checks in CI.

**69. Unit vs integration vs end-to-end?** Unit: one function. Integration: components together (e.g. nginx + app). E2E: real browser journey. Keep many unit, fewer E2E. *Gap: automated E2E (Playwright) is a next step.*

**70. How do you test an `nginx.conf`?** `nginx -t` in a container of the same version in CI; smoke tests after deploy.

**71. What makes a test good?** Fails when the code is wrong (not just runs the code), readable names, tests behaviour not implementation, deterministic, fast.

---
## 10. Troubleshooting, system design, behavioural

**72. "The map is slow." Walk me through it.** Reproduce and measure; split the path (browser -> nginx -> GeoServer -> DB); time each hop; form a hypothesis; test it; change one thing; re-measure. (Tell the 244 ms story.)

**73. "A deployment broke production." What do you do?** Roll back first, investigate second; communicate; find root cause; add a test/check so it cannot recur; write it down (blameless postmortem).

**74. Design a CI/CD for a team of 10 with staging and production.** Trunk-based, PR checks, build once, push artifact/image to a registry, auto-deploy to staging, smoke/E2E there, manual approval for production, blue/green or canary, automated rollback, secrets in a vault, monitoring and alerts, audit trail.

**75. How would you containerise this?** Multi-stage Dockerfile building the static site then copying into an `nginx` image; CI pushes the image; deploy by image tag (compose/Kubernetes); rollback = previous tag; same nginx config mounted/baked.

**76. What would you do differently?** Add backend auth earlier, set up the repo/CI first, automate E2E tests, measure latency before building features, move GeoServer next to the database.

**77. Biggest technical risk right now?** Open dashboard + DB exposure + single environment. I know the mitigations and their order.

**78. Tell me about a mistake you made.** (Use Story 3: the ssh empty-argument bug, or the vitest 4 upgrade that crashed npm and how I restored a known-good state quickly and documented it.)

**79. How do you work with a teammate?** PRs with a template, small changes, written decisions (ADRs), runbooks, agree conventions in CONTRIBUTING.md, kind specific reviews.

**80. How do you handle not knowing something in an interview?** Say what you know, how you would find out, and a related thing you *have* done. Honesty beats bluffing.
