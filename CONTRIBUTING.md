# Contributing

This is how we work on the UPAVP portal. It is deliberately small: two or three developers, one `main` branch, short-lived
branches, pull requests, and a pipeline that does the boring checks for us.

## 1. The workflow

```
main  ●────●────────●─────────●──►   always deployable, protected
            \      /           \
 feature/x   ●──●──●             \
                                  hotfix/y ●──●
```

1. **Sync:** `git switch main && git pull`.
2. **Branch:** `git switch -c feature/short-description` (`fix/...`, `docs/...`, `chore/...`).
3. **Work in small commits** and run `npm run lint && npm test` before pushing.
4. **Push and open a pull request** into `main`. Fill in the template. Draft PRs are fine for early feedback.
5. **CI runs automatically.** Fix anything red. (CI = lint, unit tests, build, Python tests, shell/nginx/workflow checks, secret + dependency scan.)
6. **A teammate reviews** (see below) and approves.
7. **Squash-merge.** The merge to `main` triggers **CD**, which deploys the artifact CI just built to pre-production and smoke-tests it.
8. **Watch the deployment** (Actions tab). If it is bad: Actions -> CD -> *Run workflow* -> `rollback`.

**Rules**
* No direct pushes to `main`. No force-pushes. No editing files on the server.
* One pull request = one purpose. Keep them reviewable (aim for under ~400 changed lines).
* A hot-fix follows the same path (branch -> PR -> merge); it is just reviewed first.

## 2. Commit messages (Conventional Commits)

`type(scope): what changed` - present tense, under ~72 characters.

```
feat(dashboard): add landuse class filter
fix(login): stop sign-in when no users are configured
docs: explain rollback
chore(ci): pin nginx image to 1.18
```
Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`. This makes the history readable and release notes easy.

## 3. What a good change contains

* **Tests for logic.** Put pure logic in `apps/*/src/lib` (no React/OpenLayers) so it is easy to test - see `cql.test.js`.
* **Generated files are generated.** Never hand-edit `apps/dashboard/src/data/*.json`; change the script and re-run it.
* **No secrets.** Not in code, not in `.env` files that are committed, not in screenshots. Use GitHub secrets / a password manager.
  CI scans for secrets, but prevention is better than detection.
* **Database / GeoServer changes** are files in `db/` or `geoserver/`, reviewed like code.
* **Docs** updated when behaviour or deployment changes.

## 4. Reviewing (the other person's checklist)

- Does it do what the description says? Run it if it is UI.
- Are the tests meaningful (would they fail if the logic was wrong)?
- Anything risky: SQL/CQL built from user input (must be quoted), new dependencies, changes to `infra/`, `db/`, `.github/`?
- Is it understandable in six months?
Be kind and specific; approve when it is good enough, not perfect.

## 5. Local setup

See the README quick start. Useful extras:

```bash
npm run test --workspace @upavp/dashboard -- --watch     # tests re-run as you type
python -m pytest apps/dashboard/scripts -q               # data-script tests
bash infra/deploy/smoke-test.sh http://27.100.38.131:8070   # check the live pre-production site
```

## 6. Releases and environments

| Environment | How it gets code | Who triggers |
|---|---|---|
| local | `npm run dev:*` | you |
| pre-production (27.100.38.131:8070) | CD on merge to `main` | automatic |
| production | *not set up yet* - will reuse the same artifact with a manual approval | - |

Each deployment is an immutable folder `releases/<time>-<commit>`; `revision.json` on the site shows which commit is live
(`http://27.100.38.131:8070/revision.json`).
