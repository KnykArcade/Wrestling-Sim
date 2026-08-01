# Phase 2B Narrative Editors Acceptance Checklist

Phase 2B is complete when the planned-show workspace supports full narrative planning without modifying TEW.

## Existing card compatibility

- Planned shows created in Phase 2A still load.
- Existing show metadata, segment order, placement, length, titles, and planning notes remain intact.
- Missing Phase 2B fields are added with safe empty defaults.
- Exported backups use version 2.
- Version 1 tracker backups remain importable.

## TEW reference data

- A TEW MDB or ACCDB snapshot can be imported directly from the planned-show workspace.
- The imported snapshot remains read-only.
- Mapped TEW workers are available in segment worker selectors.
- Mapped TEW storylines are available in storyline selectors.
- Manual worker and storyline entry remains available without a snapshot.
- Replacing or closing the snapshot does not delete narrative data already stored in a planned show.

## Match editor

- Workers can be added, assigned a role and side, and removed.
- One or more storylines can be linked and removed.
- Match type, championship, planned winner, and planned finish can be stored.
- Full Match Story text can be written and retained.
- Key moments, interference, and post-match events can be stored.
- Purpose, storyline consequences, planned follow-up, and private notes can be stored.
- Match Story and a formatted TEW entry summary can be copied.

## Angle editor

- Workers can be added, assigned a role, and removed.
- One or more storylines can be linked and removed.
- Location and content type can be stored.
- Full Segment Output text can be written and retained.
- Intended audience takeaway can be stored.
- Purpose, storyline consequences, planned follow-up, and private notes can be stored.
- Segment Output and a formatted TEW entry summary can be copied.

## Persistence and safety

- All narrative fields save automatically in browser storage.
- Reloading the page restores the complete card and narrative text.
- Duplicating a show creates independent nested segment and worker records.
- JSON export and import retain all Phase 2B fields.
- The application does not write to a TEW database or executable.

## Engineering checks

- `npm test` passes.
- `npm run build` passes.
- `npm run test:browser` passes.
- The browser test creates a match and angle, writes narrative text, adds manual references, reloads, and verifies persistence.
