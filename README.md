# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, selecting match approaches, generating editable Match Stories and Angle Segment Outputs, managing competitions, preparing TEW transfer packages, and preserving creative history. TEW remains the game and the final authority for running every show.

## Phase 5C: Unified TEW Show Operations

The new default **Show Operations** workspace connects the existing systems into one show-centered workflow:

1. Draft the card.
2. Complete match approaches, Match Stories, and Angle Outputs.
3. Resolve the full-card preflight.
4. Finalize a frozen handoff version.
5. Generate and complete assisted TEW entry.
6. Run the show in TEW.
7. Load the updated read-only TEW snapshot.
8. Review and confirm suggested result links.
9. Complete downstream championship, competition, storyline, and ranking confirmations.

### Operational stages

Each show receives a derived stage:

- Draft
- Creative Ready
- Handoff Ready
- Entering in TEW
- Entered
- Awaiting Results
- Reconciliation Needed
- Reconciled

The workspace identifies the next required action and opens the affected show or segment rather than leaving the user with a passive warning list.

### Full-card preflight

Show-level checks cover identity, target runtime, repeated worker use, finalized-version age, and transfer-package age.

Match checks cover participants, roles, match type, booked outcome requirements, Match Story, duration-controlled approach count, stamina load, pace conflicts, title stakes, and competition links.

Angle checks cover participants, roles, location, purpose, audience takeaway, and complete Segment Output.

Issues are classified as **Blocking**, **Important**, or **Advisory**. Deliberate booking choices can be acknowledged without deleting the original warning.

### Show-day operations

The operational entry view summarizes:

- Event-field progress
- Segments entered
- Exact saved resume position
- Running order
- Stale-package warnings
- Current finalized handoff version

The detailed copy and field-entry controls remain in **TEW Transfer**.

### Controlled entry changes

Late changes made while entering the card in TEW can record:

- Original tracker value
- Value entered into TEW
- Reason for the change
- Segment affected
- Whether the creative plan must be updated
- Whether a new handoff version is required

The original plan is never silently overwritten.

### Post-show result intake

The loaded read-only TEW snapshot can be analyzed against the planned show. Suggested matches use:

- Show name, date, company, and venue
- Participant overlap
- Match-description similarity
- Card section
- Planned versus actual duration
- Winner agreement

Every suggestion receives a confidence score and must be Confirmed or Rejected. Confirmed links update tracker reconciliation only after an explicit apply action. TEW remains authoritative for the actual result and rating.

### Recovery and persistence

The workspace stores issue acknowledgements, last-viewed section, entry-change notes, result-intake sessions, and applied-link history. It also surfaces browser-storage usage, stale handoff or transfer versions, duplicate segment identifiers, and saved TEW-entry resume position.

Backup version **14** includes Show Operations data. Versions 1 through 13 remain importable.

## Phase 5B: Guarded TEW Transfer Prototype

The **TEW Transfer** workspace makes the companion-to-TEW handoff more practical without pretending the browser can safely write an Access database.

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

Mappings progress through:

- Candidate
- Corroborated
- Verified
- Export Eligible
- Unsupported

Verified and Export Eligible stages require repeatable controlled evidence. Export eligibility also requires a confirmed identity field, High confidence, documented TEW value formatting, documented required defaults, and linked raw-evidence sessions.

### Guarded exporter audit

The exporter prototype checks the source-copy confirmation, backup requirement, mapping eligibility, retained evidence, TEW participant IDs, required card information, and Access writer availability.

The final gate intentionally fails because the installed `mdb-reader` dependency is read-only. The prototype produces an audit and dry run, but **does not create or modify an MDB/ACCDB file**.

## TEW Companion workflow

TEW remains authoritative for winners, match ratings, company simulation, contracts, finances, and the wider game world.

## Competition management

The **Competitions** workspace manages tournaments, Cups, leagues, Classics, custom competitions, seeded brackets, round-robin schedules, standings, planned-show scheduling, and TEW result synchronization.

Ready-to-edit templates include:

- **PWL World Classic**
- **PWL World Tag Classic**
- **PWL League**

## Match approach and output workflow

Every planned match can use nineteen match aims, duration-controlled approach slots, tracker-side wrestler ratings and styles, eighteen approach skills, combination-level approach AI, manual locks, stamina budgeting, optional advisory performance previews, and editable match-phase drafts.

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
