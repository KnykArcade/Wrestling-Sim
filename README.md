# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, selecting match approaches, generating editable Match Stories and Angle Segment Outputs, managing competitions, preparing TEW transfer packages, and preserving creative history. TEW remains the game and the final authority for running every show.

## Phase 5B: Guarded TEW Transfer Prototype

The new **TEW Transfer** workspace makes the companion-to-TEW handoff more practical without pretending the browser can safely write an Access database.

### Assisted TEW transfer

A planned card can be translated into TEW entry order:

1. Event information
2. Pre-show segments
3. Main-show segments
4. Post-show segments
5. Final review

Every transfer field is identified as one of:

- **Direct TEW Field** — intended for an equivalent TEW booking field
- **TEW Notes** — creative direction best carried into road-agent or segment notes
- **Companion Only** — the custom match-approach or advisory layer that TEW does not directly represent

The workspace provides:

- Individual-field copying
- Complete-segment copying
- Previous and next segment navigation
- Alt+Left and Alt+Right keyboard navigation
- Field status: Pending, Copied, Entered, or Not Applicable
- Segment-completion tracking
- Saved transfer progress
- JSON and clean-text packages

Match transfer sheets include the match aim, intended pace, selected approaches, stamina costs, Match Story, key moments, winner, finish, interference, and post-match direction. Angle sheets include participants, roles, location, content type, Segment Output, consequences, follow-up, and audience takeaway.

### Raw before-and-after evidence

A controlled research session can reopen only the candidate tables deliberately selected by the user from two copied databases:

- Before entering a small test card manually in TEW
- After entering that exact test card

The read-only researcher can sample up to 2,000 rows per selected table and report:

- Inserted rows
- Removed rows
- Changed rows
- Field-level before-and-after values
- Candidate record-identity columns
- Possible automatically generated fields

The output is evidence for investigation. It is not permission to write.

### Evidence-gated mappings

Mappings now progress through explicit stages:

- Candidate
- Corroborated
- Verified
- Export Eligible
- Unsupported

Verified and Export Eligible stages require repeatable controlled evidence. Export eligibility also requires:

- A confirmed identity field
- High confidence
- Documented TEW value formatting
- Documented required default values
- Linked raw-evidence sessions

Every accepted stage change is recorded in mapping history.

### Guarded exporter audit

The exporter prototype checks:

- The source is a disposable copy
- A second automatic backup would be required
- Every required operation has an Export Eligible mapping
- Mapping evidence is retained
- Every participant resolves to a TEW identifier
- Required show and segment values are complete
- A verified Microsoft Access writer exists

The final gate intentionally fails because the installed `mdb-reader` dependency is read-only. The prototype therefore produces a downloadable audit and dry run, but **does not create or modify an MDB/ACCDB file**.

An externally produced output copy can be loaded for read-only round-trip validation. The tracker checks that the database remains readable, the expected show exists, the expected match count is present, and planned TEW-linked workers still resolve.

### Backup version 13

Version 13 backups include:

- TEW-oriented transfer packages
- Field and segment entry progress
- Transfer audit logs
- Raw evidence sessions
- Mapping confidence history and export-eligibility decisions
- Guarded exporter audits
- Round-trip validation results
- All Phase 5A and earlier creative, competition, championship, handoff, worker, storyline, and match-engine data

Backup versions 1 through 12 remain importable.

## TEW Companion workflow

The default workflow remains:

1. Import a current read-only TEW snapshot.
2. Plan the card in the tracker.
3. Select match approaches.
4. Complete Match Stories and Angle Segment Outputs.
5. Finalize the frozen handoff package.
6. Use TEW Transfer or the Entry Assistant.
7. Run the show in TEW.
8. Import the post-show snapshot and reconcile the actual results.

TEW remains authoritative for winners, match ratings, company simulation, contracts, finances, and the wider game world.

## Competition management

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

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- Raw research is limited to copied databases and deliberately selected tables.
- Candidate mappings do not enable writes.
- Export audits retain a hard `writingEnabled: false` boundary.
- No output database is produced without a verified Access writer and complete evidence gates.
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
