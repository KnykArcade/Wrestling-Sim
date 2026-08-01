# TEW IX Story Tracker

A narrowly scoped companion for **Total Extreme Wrestling IX**. The project exists to improve tracking of angle outputs, match stories, and storyline history without changing TEW's simulation, booking rules, executable, or save files.

## Phase 1 status

Phase 1 is a read-only browser prototype that:

- Opens a user-selected `.mdb` or `.accdb` snapshot in browser memory.
- Inventories the database tables and columns.
- Detects known TEW show-history, match-history, participant, worker, and storyline tables.
- Reconstructs previous shows and their linked matches.
- Resolves match and storyline participants when worker records are available.
- Displays mapping warnings instead of inventing missing information.
- Never writes to the selected database and never uploads it to an application server.

Phase 1 does **not** yet create angle outputs or match-story notes. Those editing and permanent-history features belong to Phase 2 after the read-only import is verified against an MDB generated from a real TEW IX save.

## Read-only architecture

The prototype is a static React application. The selected Access database is read with `mdb-reader` inside the browser session. There is no API endpoint, database upload, save-file mutation, or TEW executable modification.

The initial mapper recognizes these table families:

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

## Verification commands

```bash
npm test
npm run build
```

GitHub Actions runs both commands for every pull request.

## Required real-save verification

The installation-template MDB files are useful for schema investigation, but the Phase 1 acceptance test requires an MDB snapshot generated from an active TEW IX save. The snapshot should be opened only through the prototype's file selector; it should not be added to the repository.

The diagnostic screen records which tables were matched, which tables were missing, row counts, column names, truncation warnings, orphan matches, and unresolved worker references. Those results will determine any schema aliases needed before Phase 2.
