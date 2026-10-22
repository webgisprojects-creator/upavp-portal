## What and why
<!-- One or two sentences. Link the issue if there is one. -->

## How to test
<!-- What did you click / run? Include screenshots for UI changes. -->

## Checklist
- [ ] `npm run lint` and `npm test` pass locally (CI will check again)
- [ ] I added or updated tests for the logic I changed
- [ ] No secrets, passwords or personal data in the diff
- [ ] If a generated data file changed (`apps/dashboard/src/data/*.json`), I re-ran `build-map-data.py` rather than editing by hand
- [ ] If the database or GeoServer needs a change, it is described below / in `db/` or `geoserver/`
- [ ] Docs updated if behaviour or deployment changed

## Risk / rollback
<!-- What could break? Rollback is: Actions -> CD -> Run workflow -> rollback. -->
