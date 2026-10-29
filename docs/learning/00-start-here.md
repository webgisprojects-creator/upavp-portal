# Learn this project - and be ready to talk about it in interviews

This folder turns the UPAVP portal into a **learning course**. Every concept here is something that really exists in this repository, so
you can open the file, run the command, break it and fix it. That is the fastest way to *understand* DevOps rather than memorise it.

## The honest foundation (read this first)

Interviewers test **understanding**, not what you typed. This project was built with an AI coding assistant. That is a normal, professional way
to work today - but it only helps you if **you can explain every part and defend every decision**. So:

* Say what is true: *"I designed and delivered it, using an AI assistant for pair-programming, and I reviewed and tested every change."*
* Never claim something you cannot explain. If a question is outside what you did, say so and describe how you *would* do it.
* The labs in `05-hands-on-labs.md` make you **do** the work yourself so your answers come from experience.

## What you will be able to say after this

> "I took a two-part prototype - a login page and a GIS dashboard on separate servers - and turned it into **one repository with a CI/CD pipeline**.
> Every pull request is linted, unit-tested, built and security-scanned. Merging to `main` deploys the *same tested artifact* to pre-production over SSH
> with a lock, an nginx config test, an **atomic release switch**, a smoke test, and **automatic rollback**. I also diagnosed why the map was slow
> (a 244 ms network hop to GeoServer, not the database) and fixed what I could with caching and tiling."

## The learning path (about 2 weeks, 1-2 hours a day)

| Day | Read | Do |
|---|---|---|
| 1 | [01-project-story.md](01-project-story.md) | Practise the 60-second and 3-minute pitches out loud |
| 2-3 | [02-concepts.md](02-concepts.md) part A (Git, CI/CD) | Lab 1 and Lab 2 |
| 4-5 | [03-cicd-explained.md](03-cicd-explained.md) | Lab 3 (add a test), Lab 4 (rollback drill) |
| 6-7 | [02-concepts.md](02-concepts.md) part B (web, nginx, caching) | Lab 5 (smoke check), Lab 6 (new CI job) |
| 8-9 | [02-concepts.md](02-concepts.md) part C (databases, GIS) | Lab 7 (latency maths), Lab 8 (read the nginx config aloud) |
| 10 | [04-interview-qa.md](04-interview-qa.md) sections 1-4 | answer each question aloud **before** reading the answer |
| 11-12 | [04-interview-qa.md](04-interview-qa.md) sections 5-9 | Lab 9 (DB migration) |
| 13 | [06-cheatsheet.md](06-cheatsheet.md) | Lab 10 (mock interview with a friend) |
| 14 | everything | draw the architecture and the pipeline from memory on paper |

## How to study

1. **Active recall:** cover the answer, say it aloud, then compare. Reading is not learning.
2. **Explain it to someone** (your teammate is perfect) - if you cannot explain it simply, you do not know it yet.
3. **Break things on purpose** (in a branch, or against pre-production only with a rollback ready) and watch the pipeline react.
4. **Keep a "decisions I can defend" list:** for each choice (nginx, symlink releases, artifact reuse...) write *why* and *what the alternative was*.

## Map of this repository to interview topics

| Interview topic | Where to look in the repo |
|---|---|
| Git / branching / PR workflow | `CONTRIBUTING.md`, `.github/pull_request_template.md` |
| CI | `.github/workflows/ci.yml` |
| CD, deployment strategy, rollback | `.github/workflows/cd.yml`, `infra/deploy/*.sh` |
| Linux, shell scripting | `infra/deploy/remote-activate.sh`, `smoke-test.sh` |
| Web server / reverse proxy / caching | `infra/nginx/upavp-portal.conf` |
| Testing | `apps/dashboard/src/config/layoutFields.test.js`, `apps/login/src/auth/demoAuth.test.js` |
| Security / secrets | `.gitignore`, `ci.yml` security job, `apps/login/src/auth/demoAuth.js`, `docs/github-setup.md` |
| Databases / PostGIS | `db/setup/001_create_database.sql` |
| GIS / performance | `docs/architecture.md` section 6, `geoserver/README.md` |
| Frontend engineering | `apps/dashboard/src/components/MapContainer.jsx`, `lib/cql.js` |
| Teamwork: access, roles, authorship (UI + CLI) | [07-teammates-and-access.md](07-teammates-and-access.md) |
