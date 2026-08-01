# TEW IX Story Tracker

A narrowly scoped companion for **Total Extreme Wrestling IX**. The project exists to improve tracking of angle outputs, match stories, and storyline history without changing TEW's simulation, booking rules, executable, or save files.

## Phase 2A status

Phase 2A adds a planned-show workspace that works before a show exists inside TEW.

- Create, rename, duplicate, and delete planned shows.
- Store the show date, company, type, expected length, venue, status, and general notes.
- Add match and angle placeholders in running order.
- Set each segment's placement, planned duration, name, and basic planning notes.
- Move segments upward or downward without changing TEW.
- Calculate the currently planned time against the show's expected length.
- Save automatically in browser storage.
- Export all planned shows to a JSON backup and restore that backup later.

The planned-show workspace is independent from the MDB importer. A TEW snapshot is optional while the card is being built.

Phase 2A intentionally uses a basic planning-notes field for each segment. The full Match Story and Angle Segment Output editors, worker selection, storyline linking, and copy-to-TEW tools belong to Phase 2B.

## TEW read-only import

The existing importer:

- Opens a user-selected `.mdb` or `.accdb` snapshot in browser memory.
- Inventories the database tables and columns.
- Detects known TEW show-history, match-history, participant, worker, and storyline tables.
- Reconstructs previous shows and their linked matches.
- Resolves match and storyline participants when worker records are available.
- Displays mapping warnings instead of inventing missing information.
- Never writes to the selected database and never uploads it to an application server.

The application remains static and browser-based. There is no API endpoint, database upload, save-file mutation, or TEW executable modification.

The importer recognizes these table families:

- `Previous_Shows`
- `Match_Histories`
- `Match_Histories_Wrestlers`
- `Player_Storylines`
- `tblStoryline`
- `tblStorylineInvolved`
- `Workers` and common worker-table name variants

Table and field matching is case-insensitive and ignores underscores so that small schema-name differences can be diagnosed safely.

## Open in GitHub Codespaces

1. Open this repository in GitHub.
2. Choose **Code → Codespaces → Create codespace on the current branch**.
3. Wait for the automatic dependency installation to finish.
4. Run `npm run dev` in the Codespaces terminal.
5. Open the forwarded **TEW Story Tracker Preview** port.

No TEW database should be committed to GitHub. `.mdb` and `.accdb` files are excluded by `.gitignore`.

Browser storage belongs to the current preview origin. Export a tracker backup before deleting a Codespace or moving to a different Codespace URL.

## Verification commands

```bash
npm test
npm run build
npm run test:browser
```

GitHub Actions runs all three checks for every pull request.

## Next phase

Phase 2B will add the full narrative editors needed to write Match Stories and Angle Segment Outputs while building the card, then copy those details into TEW during booking.
