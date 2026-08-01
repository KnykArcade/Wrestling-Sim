# TEW IX Story Tracker

A narrowly scoped companion for **Total Extreme Wrestling IX**. The project exists to improve tracking of angle outputs, match stories, and storyline history without changing TEW's simulation, booking rules, executable, or save files.

## Phase 2B status

Phase 2B turns each planned match and angle into a complete narrative record while the card is being built.

### Match editor

- Assign workers from an imported TEW snapshot or enter names manually.
- Record each person's role and match side or team.
- Link imported TEW storylines or manual planning storylines.
- Store match type, championship, planned winner, and planned finish.
- Write the full Match Story.
- Track key moments, interference, and post-match events.
- Record the segment's purpose, storyline consequences, planned follow-up, and private notes.
- Copy the Match Story or a formatted TEW entry summary.

### Angle editor

- Assign workers and describe each person's role.
- Link imported or manual storylines.
- Store location and content type.
- Write and permanently retain the full Segment Output.
- Record the intended audience takeaway, purpose, consequences, follow-up, and private notes.
- Copy the Segment Output or a formatted TEW entry summary.

Narratives, worker references, and storyline links save automatically with the planned show. Existing Phase 2A cards are migrated automatically with empty Phase 2B fields; no planned matches or angles are discarded.

## Planned-show workspace

The tracker can be used before a show exists inside TEW.

- Create, rename, duplicate, and delete planned shows.
- Store the show date, company, type, expected length, venue, status, and general notes.
- Add matches and angles in running order.
- Set each segment's placement, planned duration, and name.
- Move segments upward or downward without changing TEW.
- Calculate planned time and narrative completion against the show length.
- Save automatically in browser storage.
- Export all planned shows to a versioned JSON backup and restore it later.

A TEW snapshot is optional. Manual worker and storyline entry always remains available. Importing a snapshot inside the planner makes its mapped worker list and storylines selectable without writing anything back to TEW.

## TEW read-only import

The importer:

- Opens a user-selected `.mdb` or `.accdb` snapshot in browser memory.
- Inventories the database tables and columns.
- Detects known TEW show-history, match-history, participant, worker, and storyline tables.
- Exposes imported workers to the planned-show narrative editors.
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

Phase 2C will reconcile a planned show with a completed TEW show, preserve planned-versus-actual details, attach TEW ratings and results, and convert the planned card into permanent enhanced show history.
