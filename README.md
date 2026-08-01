# TEW IX Story Tracker

A focused companion for **Total Extreme Wrestling IX** that preserves match stories, angle outputs, and planned-versus-actual show history without changing TEW's simulation, executable, or save files.

## Phase 2C status

Phase 2C connects a planned card to the completed TEW show after the show has been run.

### Reconciliation workflow

1. Build the planned show and write its Match Stories and Segment Outputs.
2. Book and run the show inside TEW.
3. Create a fresh TEW MDB snapshot.
4. Replace the planner's TEW reference with the post-show snapshot.
5. Open **Reconcile Results** for the planned show.
6. Link the completed TEW show, review the suggested match links, and record final angle details.
7. Finalize the show as permanent enhanced history.

### Planned-show matching

- Ranks completed TEW shows using show name, date, company, and match count.
- Displays a confidence score and the reasons behind each suggestion.
- Allows manual selection when the suggested show is not correct.
- Prevents the same TEW show from being linked to two planned shows.

### Match reconciliation

- Suggests TEW match records using participants, card placement, description, winner, and card order.
- Allows every suggested match to be manually replaced or left unmatched.
- Displays Planned and Actual information side by side.
- Preserves the original Match Story and planned finish.
- Stores TEW result text, rating, winner, match time, notes, placement, and participants.

### Angle reconciliation

TEW does not reliably retain the complete Segment Output in historical MDB records. The tracker therefore preserves the planned version and provides fields for:

- Actual angle rating
- Whether the segment happened as planned
- Final Segment Output
- Changes made during booking or the show
- Actual storyline consequences
- Final follow-up

### Enhanced show history

Finalizing reconciliation creates a persistent record containing:

- Original plan
- Final narrative
- Planned-versus-actual differences
- TEW show rating and attendance
- TEW match ratings and results
- Storyline consequences and follow-ups
- The source MDB filename used for reconciliation

The finalized record remains available after the TEW snapshot is closed. It can be reopened and corrected without deleting the original plan.

## Narrative editors

Each match and angle can be fully written while the card is being built.

### Match editor

- Imported or manually entered workers
- Worker roles and teams/sides
- Imported or manual storyline links
- Match type, championship, winner, and finish
- Full Match Story
- Key moments, interference, and post-match events
- Purpose, consequences, follow-up, and private notes
- Copy Match Story and formatted TEW entry summary

### Angle editor

- Imported or manually entered workers and roles
- Imported or manual storyline links
- Location and content type
- Full Segment Output
- Audience takeaway
- Purpose, consequences, follow-up, and private notes
- Copy Segment Output and formatted TEW entry summary

## Planned-show workspace

- Create, rename, duplicate, and delete shows.
- Add matches and angles in running order.
- Set placement and planned duration.
- Track segment workflow status from Planned through Reconciled.
- Calculate planned time and narrative completion.
- Save automatically in browser storage.
- Export version 3 backups containing plans and reconciled history.
- Import version 1, 2, or 3 backups.

Duplicating a completed show creates a clean new plan without copying linked TEW results.

## TEW read-only import

The importer:

- Opens `.mdb` and `.accdb` snapshots in browser memory.
- Inventories database tables and columns.
- Reads previous shows, match histories, participants, workers, and storylines.
- Exposes mapped workers and storylines to the planner.
- Never writes to the selected database.
- Never uploads the database to an application server.

## Open in GitHub Codespaces

1. Open this repository in GitHub.
2. Choose **Code → Codespaces → Create codespace on the current branch**.
3. Wait for dependency installation to finish.
4. Run `npm run dev`.
5. Open the forwarded **TEW Story Tracker Preview** port.

No TEW database should be committed to GitHub. `.mdb` and `.accdb` files are excluded by `.gitignore`.

Browser storage belongs to the current preview origin. Export a tracker backup before deleting a Codespace or moving to another Codespace URL.

## Verification commands

```bash
npm test
npm run build
npm run test:browser
```

GitHub Actions runs all three checks for every pull request.
