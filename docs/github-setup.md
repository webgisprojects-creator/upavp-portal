# GitHub and server setup

This describes what is configured today and how to recreate it (new repository, new server, or after a key rotation).

> **Plan note.** On a free personal account, **branch protection, rulesets and required reviewers for environments only work on public
> repositories.** This repository is private on a free plan, so "no direct push to `main`, a teammate reviews every pull request" is a
> **team agreement** (CONTRIBUTING.md), not an enforced setting. Upgrading to GitHub Pro enforces it (step 5). Keep the source private.

## What is configured now

| Item | Value |
|---|---|
| Repository | `webgisprojects-creator/upavp-portal` (private), default branch `main`, squash-merge only, branches deleted after merge |
| Secrets | `DEPLOY_SSH_KEY` (private key of the deploy user), `VITE_DEMO_USERS` (temporary demo sign-ins, injected at build time) |
| Variables | `DEPLOY_HOST=27.100.38.131`, `DEPLOY_USER=upavp-deploy`, `PUBLIC_URL=http://27.100.38.131:8070`, `DEPLOY_KNOWN_HOSTS` (the server's RSA host key) |
| Environment | `pre-production` (created automatically on first use) |
| Server user | `upavp-deploy` - restricted, see docs/deployment.md section 8 |

## 1. Create the repository and push

You must be signed in to `gh` as the account that owns the repo (`gh auth status`, `gh auth switch`). Pushing workflow files needs the
token scope `workflow` (`gh auth refresh -s workflow`). If git picks the wrong saved account, force the right one for this repo:

```bash
git remote set-url origin https://<OWNER>@github.com/<OWNER>/upavp-portal.git
git config --local credential.helper ""
git config --local --add credential.helper "!gh auth git-credential"
gh repo create <OWNER>/upavp-portal --private --source . --remote origin --push
gh repo edit <OWNER>/upavp-portal --delete-branch-on-merge --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false
```
Device-login codes (`gh auth login --web`) expire after ~15 minutes and must be **approved** (the final "Authorize" button), not just entered.

## 2. Create the restricted deploy user on the server (administrator, once)

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-upavp-deploy" -f ./upavp_deploy_key       # a key used ONLY by the pipeline
bash infra/server/bootstrap.sh install ./upavp_deploy_key.pub --target pre-prod             # needs ssh as root; idempotent
```
`bootstrap.sh` creates `upavp-deploy` (no password, restricted key), hands it ownership of `/var/www/upavp-portal`, installs the root-owned helper
`/opt/upavp/bin/install-nginx-conf`, writes a **validated** sudoers file (`visudo -cf` before install) and proves that unrestricted sudo is denied.
It never touches the server's existing `deploy` user. Undo: `bash infra/server/bootstrap.sh remove`.

## 3. Secrets and variables

```bash
OWNER_REPO=<OWNER>/upavp-portal
gh secret set DEPLOY_SSH_KEY --repo $OWNER_REPO < ./upavp_deploy_key
rm ./upavp_deploy_key ./upavp_deploy_key.pub               # the private key now lives only in GitHub

# the server only has RSA/DSA host keys, so pin the RSA one (read over an authenticated ssh session, not ssh-keyscan)
ssh pre-prod 'cat /etc/ssh/ssh_host_rsa_key.pub' | awk '{print "27.100.38.131 " $1 " " $2}' | gh variable set DEPLOY_KNOWN_HOSTS --repo $OWNER_REPO
gh variable set DEPLOY_HOST --repo $OWNER_REPO --body "27.100.38.131"
gh variable set DEPLOY_USER --repo $OWNER_REPO --body "upavp-deploy"
gh variable set PUBLIC_URL  --repo $OWNER_REPO --body "http://27.100.38.131:8070"

# temporary demo sign-in list - the same JSON as apps/login/.env.example (never commit it)
gh secret set VITE_DEMO_USERS --repo $OWNER_REPO --body '[{"username":"...","password":"..."}]'
```
CI **refuses to build a `main` artifact without `VITE_DEMO_USERS`**: otherwise a login with sign-in silently disabled would be deployed.

## 4. Prove it works

1. Actions -> **Deploy readiness check** -> Run workflow. It checks, from a real GitHub runner: port 22 reachable, the deploy key works and the host key matches,
   the user is not root, unrestricted sudo is denied, the site directory is writable, the helper is installed.
2. Merge a small pull request. **CI** goes green, then **CD** deploys the CI artifact; `curl http://27.100.38.131:8070/revision.json` shows the new commit.
3. Actions -> **CD** -> Run workflow -> action `rollback`, then `deploy` again, to prove both manual paths.

## 5. Branch protection (needs GitHub Pro/Team for a private repo)

```bash
gh api -X PUT repos/$OWNER_REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["CI passed"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```
For production, create a `production` environment with **required reviewers** and reuse the same artifact.

## 6. If GitHub cannot reach the server

GitHub-hosted runners connect from the internet. Today port 22 of the server is open to the internet, so this works. If SSH is ever restricted by IP:
allow GitHub's runner ranges (`curl https://api.github.com/meta`, key `actions`), or install a **self-hosted runner** on a machine inside the network and change
`runs-on` in `cd.yml` and `deploy-readiness.yml` to `[self-hosted, linux]`. The readiness check tells you immediately which case you are in.

## 7. Rotating the deploy key (do this periodically and whenever someone with access leaves)

Generate a new key, run step 2 again with the new `.pub` (it replaces the old one), update the `DEPLOY_SSH_KEY` secret, delete the local files, run the readiness check.
