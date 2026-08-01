# Phase 2C Acceptance Checklist

## Show linking

- A planned show can open the Reconcile Results screen.
- The screen clearly requests a post-show MDB when no snapshot is loaded.
- Completed TEW shows are ranked by name, date, company, and match count.
- Confidence scores and matching reasons are visible.
- A user can override the suggested TEW show.
- One completed TEW show cannot be linked to multiple planned shows.

## Match reconciliation

- Planned matches receive suggested TEW match-history links.
- Participant overlap, placement, description, winner, and order influence matching.
- A user can replace or remove every suggested match link.
- Planned winner, finish, duration, participants, and Match Story remain visible.
- Actual result, winner, duration, rating, notes, placement, and participants are visible.
- Original planned narrative is never overwritten.

## Angle reconciliation

- Planned Segment Output remains preserved.
- A user can record whether the angle happened as planned.
- Actual angle rating can be entered manually.
- Final Segment Output, changes, consequences, and follow-up can be saved.
- The interface does not invent unavailable TEW angle history.

## Enhanced history

- Finalizing marks the show and every segment Reconciled.
- Planned and actual data are stored together in browser storage.
- Closing the TEW snapshot does not remove saved actual results.
- A reconciled show can be reopened and corrected.
- Unlinking removes saved actual data without deleting the plan.
- Duplicating a show creates a clean plan without actual-result links.

## Persistence and backups

- Phase 1, 2A, and 2B saved cards migrate with empty reconciliation defaults.
- Version 3 backup export contains reconciliation history.
- Version 1, 2, and 3 backups can be imported.
- Reloading the browser preserves the selected show's reconciled data.

## Safety

- No TEW MDB or ACCDB is modified.
- No TEW executable is modified.
- The post-show snapshot remains read-only and browser-local.

## Automated verification

- `npm test` passes.
- `npm run build` passes.
- `npm run test:browser` passes.
