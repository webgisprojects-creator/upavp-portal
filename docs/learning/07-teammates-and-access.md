# Adding a teammate: access, roles and authorship (UI and CLI)

Every step is shown **twice**: by clicking in GitHub (UI) and by command line (CLI, `gh`). Learn both: the UI is how most people do it; the CLI is how you
automate it and how you prove to yourself exactly what happened. `OWNER` = the repository owner, `REPO` = `upavp-portal`, `USER` = the teammate's GitHub username.

## 0. Two different ideas people mix up

| Idea | What it means | Where it lives |
|---|---|---|
| **Access** (permission) | what a person is *allowed to do* in the repository: read, push, change settings... | GitHub's permission system (this document, sections 1-6) |
| **Authorship** | who *wrote* a change | inside each git commit (`author name <email>`), see section 8 |

Giving someone access does **not** make them an author, and you must never rewrite history to put someone's name on commits they did not make.
They become an author by making commits (or by being credited with a `Co-authored-by:` trailer on work they really contributed to).

## 1. Permission levels - and the catch with personal repositories

| Repository owned by... | Roles available |
|---|---|
| **a personal account** (our case today) | exactly **two**: the *owner* and *collaborators*. A collaborator can read and **push**, open/merge pull requests, manage issues. A collaborator **cannot** change settings, manage secrets/variables, change visibility, delete the repository or manage other collaborators. |
| **an organization** | **Read, Triage, Write, Maintain, Admin** (and org *Owners*) - fine-grained, and several people can be admins/owners. |

So for a personal repo, "complete access" is **not possible** with a collaborator invite. The two real options:

1. **Recommended - move the repository into a free GitHub organization** and make both people *Owners* (section 7). Equal control, survives either person leaving.
2. Transfer ownership to the teammate (they become the only owner - rarely what you want).

## 2. Invite a collaborator

### UI
1. Open the repo -> **Settings** tab -> left menu **Collaborators** (under *Access*). GitHub may ask for your password / 2FA (sudo mode).
2. Click **Add people**.
3. Type the person's **username, full name or e-mail address** and pick them from the list.
4. (Organization repos only) choose a role. Click **Add ... to this repository**.
5. The page now shows **"Pending invitation"**. GitHub e-mails them.

### CLI
```bash
gh api -X PUT repos/OWNER/REPO/collaborators/USER -f permission=push
```
* `-X PUT` = HTTP method; `repos/OWNER/REPO/collaborators/USER` = the REST resource; `-f permission=push` = form field.
* On a **personal** repo `permission` is ignored (always write). On an **organization** repo use `pull`, `triage`, `push`, `maintain` or `admin`.
* Response: `201` + an invitation JSON (person is not yet a collaborator), or `204` (already one).
* The CLI needs the **username**; only the UI can invite by e-mail. Get the username from `https://github.com/<name>` or ask them to run `gh api user --jq .login`.
* **Never guess a username** - a similar-looking account belongs to a stranger and the repo may contain sensitive infrastructure details.

## 3. The invitation must be accepted

Invitations expire after **7 days**. Until accepted the person has **no** access.

### UI (the invited person)
Click **View invitation** in the e-mail, or open `https://github.com/OWNER/REPO/invitations`, then **Accept invitation**.

### CLI (the invited person)
```bash
gh api user/repository_invitations --jq '.[] | {id, repo: .repository.full_name, role: .permissions}'   # list invitations sent to me
gh api -X PATCH user/repository_invitations/<ID>                                                       # accept
```

### CLI (the owner, to watch or cancel)
```bash
gh api repos/OWNER/REPO/invitations --jq '.[] | {id, invitee: .invitee.login, permissions}'    # pending invitations
gh api -X DELETE repos/OWNER/REPO/invitations/<ID>                                              # cancel one
```

## 4. Verify (never trust, verify)

```bash
gh api repos/OWNER/REPO/collaborators --jq '.[] | {login, role: .role_name}'          # everyone with access
gh api repos/OWNER/REPO/collaborators/USER/permission --jq '{user: .user.login, permission}'   # one person
```
UI: **Settings -> Collaborators** lists everyone; the **Insights -> Contributors** page shows who has committed.

## 5. What the new person can and cannot do (personal repository)

| Can | Cannot |
|---|---|
| clone, create branches, **push branches**, open and merge pull requests | change repository settings or visibility, delete/transfer the repo |
| see and re-run Actions workflows, trigger the manual **CD** and **Deploy readiness** workflows | see or change **secrets/variables** (nobody can *read* a secret value, even owners) |
| manage issues, projects, wiki | add/remove other collaborators |
| push to `main` while branch protection is off (see CONTRIBUTING.md: team agreement) | |

Important: a person who can trigger **CD** can cause a deployment to the pre-production server. Invite only people you trust.

## 6. Remove or reduce access

```bash
gh api -X DELETE repos/OWNER/REPO/collaborators/USER       # CLI: revoke access immediately
```
UI: **Settings -> Collaborators -> bin icon** next to the person. Do this the day someone leaves, then also rotate the deploy key
(docs/github-setup.md, section 7) if they ever had server access.

## 7. "Complete access": a free GitHub organization (both people are Owners)

### UI
1. GitHub -> your avatar -> **Your organizations** -> **New organization** (or `https://github.com/organizations/plan`) -> choose **Free**.
   Name it (for example `upavp-geo`), set the contact e-mail, choose "My personal account". *(Organizations cannot be created through the public API, so this one is UI-only.)*
2. In the organization: **People -> Invite member** -> username or e-mail -> role **Owner**.
3. Move the repo: repo **Settings -> General -> Danger Zone -> Transfer ownership** -> new owner = the organization -> type the repo name to confirm.
4. After the move: issues, pull requests, stars and Actions history move with the repo and GitHub redirects the old URL. **Check that the secrets and variables came along** (`gh secret list --repo ORG/REPO`, `gh variable list --repo ORG/REPO`) and run **Deploy readiness check** before trusting CD again.

### CLI (steps 2-3 after the organization exists)
```bash
gh api -X PUT orgs/ORG/memberships/USER -f role=admin                  # invite as organization owner (role=member for a normal member)
gh api -X POST repos/OWNER/REPO/transfer -f new_owner=ORG              # transfer the repository
git remote set-url origin https://github.com/ORG/REPO.git              # update every clone
```
Then update the things that hard-code the old owner: the CI badge in `README.md`, `.github/CODEOWNERS`, links in `docs/`.
In an organization you can give people fine-grained roles per repository, create **Teams** and use **rulesets**.

## 8. Authorship: making someone "the other author" truthfully

```bash
git config user.name  "Full Name"           # what appears on the commit
git config user.email "id+username@users.noreply.github.com"   # or the e-mail verified on their GitHub account
git log --format='%an <%ae>  %s' -5         # who wrote the last commits
git shortlog -sne                            # commits per author - the real "who contributed"
```
* GitHub links a commit to a profile by **matching the commit e-mail to a verified e-mail** on that account. If it does not match, the commit shows no avatar.
* Pair-programmed or jointly written change? Add a trailer at the end of the commit message (blank line first):
  `Co-authored-by: Full Name <their-verified-email>`
* To **credit** someone in the project (without touching history) add them to an `AUTHORS.md` / the README "Authors" section.
* Do **not** rewrite old commits to change authors (it changes every commit hash and breaks everyone's clones).
* Tip: the "no-reply" address (`ID+username@users.noreply.github.com`, shown in GitHub **Settings -> Emails**) avoids publishing a private e-mail in a public repo.

## 9. Onboarding checklist for the new teammate

- [ ] Accept the invitation (section 3)
- [ ] Enable **two-factor authentication** (GitHub -> Settings -> Password and authentication)
- [ ] `gh auth login`, then `git clone https://github.com/OWNER/REPO.git`
- [ ] `npm install`, `npm run lint`, `npm test`, `npm run dev:dashboard` (README quick start)
- [ ] Read `CONTRIBUTING.md`; make a branch, change a docs typo, open a pull request, watch CI go green, get it reviewed, squash-merge
- [ ] `git config user.name` / `user.email` set correctly **before the first commit**
- [ ] Server or database access is **separate** (SSH keys, DB roles) - ask the project owner; GitHub access does not grant it
- [ ] Add their username to `.github/CODEOWNERS` and `AUTHORS.md` in a pull request

## 10. Practice lab (20 minutes)

1. Create a second GitHub account (or use a friend's) and **invite it** with the CLI (section 2), then **accept** it with the CLI (section 3).
2. Verify with section 4. Open a pull request from that account, review and merge it from yours.
3. **Revoke** access with the CLI (section 6) and confirm it is gone.
4. Explain aloud: *access vs authorship*, *why a personal repo has no admin collaborators*, *why we would use an organization*.
