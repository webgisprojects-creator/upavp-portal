# GitHub and server setup (one time)

Do these once, in order. Commands use the GitHub CLI (`gh`); each step can also be done in the web UI.

> **Check your GitHub plan first.** On a free personal account, **branch protection, rulesets and required reviewers for environments only work on
> public repositories**. For a *private* repository they need GitHub Pro/Team. If you stay on Free + private, the pipeline still works - the "no direct push to `main`,
> review before merge" rules are then a **team agreement** (see CONTRIBUTING.md) instead of an enforced setting. This project's source should stay **private**.

## 1. Create the repository and push

You must be logged in to `gh` as the account that should own the repo (`gh auth status`, `gh auth login`, `gh auth switch`).

```bash
cd UPAVP-Portal
git init -b main                                  # (already done if you used the prepared folder)
git add -A && git status                          # read the list: no .env files, no node_modules, no dist
git commit -m "chore: initial import of the UPAVP portal (login + dashboard)"
gh repo create webgisprojects-creator/upavp-portal --private --source . --remote origin --push
```

## 2. Secrets and variables (repository -> Settings -> Secrets and variables -> Actions)

```bash
OWNER_REPO=webgisprojects-creator/upavp-portal

# a key used ONLY by the pipeline (do not reuse your personal key)
ssh-keygen -t ed25519 -f ./upavp_deploy_key -N "" -C "github-actions-upavp-deploy"
ssh-copy-id -i ./upavp_deploy_key.pub root@27.100.38.131           # or append the .pub to the deploy user's authorized_keys
gh secret set DEPLOY_SSH_KEY --repo $OWNER_REPO < ./upavp_deploy_key
rm ./upavp_deploy_key ./upavp_deploy_key.pub                       # the private key now lives only in GitHub

gh variable set DEPLOY_HOST        --repo $OWNER_REPO --body "27.100.38.131"
gh variable set DEPLOY_USER        --repo $OWNER_REPO --body "root"       # replace with a least-privilege user later
gh variable set PUBLIC_URL         --repo $OWNER_REPO --body "http://27.100.38.131:8070"
ssh-keyscan -H 27.100.38.131 2>/dev/null | gh variable set DEPLOY_KNOWN_HOSTS --repo $OWNER_REPO

# temporary demo sign-in list, same JSON as apps/login/.env.example (never commit it)
gh secret set VITE_DEMO_USERS --repo $OWNER_REPO --body '[{"username":"...","password":"..."}]'
```

## 3. The `pre-production` environment

```bash
gh api -X PUT repos/$OWNER_REPO/environments/pre-production
```
Later, create `production` the same way and add **required reviewers** so a person must approve each production deployment.

## 4. Branch protection for `main` (needs Pro/Team if the repo is private)

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
Also turn on in the repo settings: *Automatically delete head branches*, *Allow squash merging* (disable merge commits), *Dependabot alerts*.

## 5. Server side

* **Reachability:** GitHub-hosted runners connect from the internet, so SSH (port 22) on 27.100.38.131 must be reachable from outside.
  If it is restricted by IP, either allow GitHub's runner ranges (`curl https://api.github.com/meta` -> `actions`) or install a **self-hosted runner**
  on a machine inside the network and change `runs-on` in `cd.yml` to `[self-hosted, linux]`.
* **Key:** the public key from step 2 must be in `~/.ssh/authorized_keys` of `DEPLOY_USER`.
* **Least privilege (recommended next):** create a `deploy` user instead of using `root`. The deploy scripts need root-level actions
  (nginx test/reload, writing `/var/www/upavp-portal`, `/etc/nginx`), so install `remote-activate.sh` and the rollback commands as root-owned
  files under `/opt/upavp/` and grant `deploy` passwordless sudo for exactly those files. Then set `DEPLOY_USER=deploy`.
* Nothing else needs installing: no Node, no git, no source on the server.

## 6. First run checklist

- [ ] Repository is private; `git log --all` contains no secrets (CI's gitleaks job will also check)
- [ ] Secrets/variables set; `pre-production` environment exists
- [ ] Open a test pull request (e.g. a docs typo): **CI** goes green, artifact `portal-site` is attached to the run
- [ ] Merge it: **CD** deploys; the run summary shows the release; `curl http://27.100.38.131:8070/revision.json` shows the new commit
- [ ] Trigger **CD -> rollback** once to prove it works, then deploy again
- [ ] Branch protection (or the team agreement) in place; teammate added as collaborator with *Write* access
- [ ] `.github/CODEOWNERS` updated with the real usernames
