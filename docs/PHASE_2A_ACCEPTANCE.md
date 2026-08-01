# Phase 2A Acceptance Checklist

Phase 2A is complete when the planned-show workspace passes the following checks.

## Planned shows

- A planned show can be created before any TEW snapshot is imported.
- Show name, date, company, type, expected length, venue, status, and notes can be edited.
- A show can be duplicated without reusing its show or segment identifiers.
- A show can be deleted after a confirmation prompt.
- Selecting a different planned show displays the correct card and metadata.

## Card construction

- Match and angle placeholders can be added to the card.
- Each segment stores its name, placement, duration, and basic planning notes.
- Segments can be moved upward and downward while preserving their data.
- Segments can be removed from the card.
- Planned segment time is totaled and compared with the expected show length.

## Persistence and backup

- Planned shows save automatically in browser storage.
- Reloading the same preview origin restores the planned shows.
- All planned shows can be exported as a versioned JSON backup.
- A valid backup can replace the planned shows in browser storage.
- Invalid or unsupported backups show an explicit error and do not replace existing data.
- The UI explains that a backup should be exported before changing Codespaces origins.

## TEW safety boundary

- Planned-show changes never write to a TEW MDB or ACCDB file.
- Existing TEW history and storyline screens remain read-only.
- A planned show can be used without importing TEW data.
- The MDB browser-compatibility test continues to pass.

## Automated verification

- `npm test` passes model, persistence, mapper, and backup validation tests.
- `npm run build` passes TypeScript and production bundling.
- `npm run test:browser` creates a show, adds a match and angle, reloads the page, and confirms persistence.
- Browser tests fail on page errors or console errors.
