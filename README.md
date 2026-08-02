# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, selecting match approaches, generating editable Match Stories and Angle Segment Outputs, managing competitions, preparing TEW handoff packages, and preserving creative history. TEW remains the game and the final authority for running every show.

## Phase 5A: TEW Companion Mode and Safe Integration Bridge

The application now opens in **TEW Companion Mode**. Its default workflow is:

1. Import a current read-only TEW snapshot.
2. Plan the card in the tracker.
3. Select match approaches.
4. Complete Match Stories and Angle Segment Outputs.
5. Finalize the frozen TEW handoff package.
6. Enter the card in TEW with the Entry Assistant.
7. Run the show in TEW.
8. Import the post-show snapshot and reconcile the actual results.

TEW remains authoritative for winners, match ratings, company simulation, contracts, finances, and the wider game world.

### Companion settings

The TEW Companion workspace stores:

- Whether Companion Mode is enabled
- Whether Advanced Preview Tools should be shown
- The preferred default Companion workspace view

The advisory performance and star-preview systems remain available, but they are treated as optional advanced tools rather than the center of the workflow.

### Read-only before-and-after comparison

Two copied TEW databases can be loaded side by side:

- Before manually entering a card
- After manually entering that same card

The comparison report identifies:

- Table row-count changes
- New or missing tables
- Schema changes visible through column metadata
- Added, removed, or changed normalized shows
- Added, removed, or changed matches
- Added, removed, or changed workers
- Added, removed, or changed storylines
- Candidate tables that deserve further investigation

A changed table is evidence to investigate. It is not automatically treated as proof that direct writing is safe.

### Field-mapping laboratory

Tracker fields can be classified as:

- Candidate
- Verified
- Unsupported

Each mapping stores:

- Tracker category and field
- Candidate TEW table and field
- Confidence level
- Before-and-after evidence
- Research notes

A mapping should only be marked Verified after repeatable evidence identifies the table, field, identifiers, and relationships.

### Bridge-readiness report

Every planned show can generate a readiness report that separates:

- Verified fields that may eventually support a guarded exporter
- Candidate mappings that still need evidence
- Manual fields that should continue through the Entry Assistant
- Missing or unsupported values that block automation

### Experimental dry-run package

A selected card can generate a non-writing proposal containing:

- Proposed target table
- Proposed target field
- Proposed value
- Referenced tracker or TEW IDs
- Validation status
- Blocking problem or manual-entry instruction

The dry-run package has a hard `writingEnabled: false` boundary. It cannot modify a TEW database.

### Backup version 12

Version 12 backups include:

- Companion Mode settings
- Field mappings and evidence
- Saved before-and-after comparison reports
- All competition, championship, handoff, match-engine, worker, storyline, booking, and planned-show data from previous versions

Backup versions 1 through 11 remain importable.

## Phase 4D: Tournament, Cup, League, and Classic Management

The **Competitions** workspace manages:

- Tournaments, Cups, leagues, Classics, and custom competitions
- Single elimination, round robin, and double round robin
- Singles, tag-team, trios, and custom participants
- Seeded brackets, automatic byes, winner advancement, and result resets
- Editable league points and transparent standings
- Planned-show scheduling and TEW result synchronization

Ready-to-edit templates include:

- **PWL World Classic**
- **PWL World Tag Classic**
- **PWL League**

The Classic templates preserve trophy and ceremonial-jacket traditions, including a respectful handoff or an attack that launches the next rivalry.

## Match approach and output workflow

Every planned match can use:

- Nineteen match aims
- Duration-controlled approach slots
- Tracker-side wrestler ratings and styles
- Eighteen approach skills
- Combination-level approach AI
- Manual locks and stamina budgeting
- Optional advisory performance and star preview
- Editable opening, middle, turning-point, finish, and aftermath drafts

Approach slots remain:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

The output generator never promotes an advisory projected winner into the booking. TEW-authoritative mode remains the default.

## Existing systems

- Planned shows with ordered matches and angles
- TEW Show Handoff and guided Entry Assistant
- Read-only MDB/ACCDB snapshot import
- Planned-versus-actual reconciliation
- Storyline Hub and timelines
- Worker creative profiles and relationships
- Championship lineage, rankings, and programs
- Creative Control Center and Future Booking Board
- Competition brackets, league schedules, standings, and PWL Classic traditions

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- The before-and-after laboratory compares copied databases only.
- Candidate field mappings do not enable writes.
- Dry-run packages cannot execute database changes.
- Reconciled TEW results remain authoritative.
- Browser data saves automatically to the current preview origin.

## Open in GitHub Codespaces

1. Open this repository in GitHub.
2. Choose **Code → Codespaces → Create codespace on the current branch**.
3. Wait for dependency installation to finish.
4. Run `npm run dev`.
5. Open the forwarded **TEW Story Tracker Preview** port.

Export a full backup before deleting a Codespace or moving to another Codespaces URL. Never commit a TEW `.mdb` or `.accdb` file to GitHub.

## Verification

```bash
npm test
npm run build
npm run test:browser
```

GitHub Actions runs all three checks for every pull request.
