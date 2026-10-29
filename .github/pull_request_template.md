## What and why
<!-- One or two sentences. Link the issue if there is one. -->

## How to test
<!-- What did you click / run? Include screenshots for UI changes. -->

## Checklist
- [ ] `npm run lint` and `npm test` pass locally (CI will check again)
- [ ] I added or updated tests for the logic I changed
- [ ] No secrets, passwords or personal data in the diff
- [ ] If a database column the dashboard uses was renamed, I updated `apps/dashboard/src/config/layoutFields.js` **and** the SLD styles in GeoServer
- [ ] If the database or GeoServer needs a change, it is described below / in `db/` or `geoserver/`
- [ ] Docs updated if behaviour or deployment changed

## Risk / rollback
<!-- What could break? Rollback is: Actions -> CD -> Run workflow -> rollback. -->
