# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, selecting wrestler-specific match approaches, creating Match Stories and Angle Segment Outputs, preparing TEW entry packages, reconciling actual TEW results, and preserving permanent creative history.

**TEW remains the game.** The companion does not replace TEW’s contracts, finances, company simulation, wider world, actual match results, or ratings. MDB and ACCDB access remains read-only.

## Current phase: 5J — Companion Home, Persistent Snapshot Vault, and Guided Promotion Onboarding

The companion is designed to reopen and use throughout a real TEW save, with core show and match booking available directly from the main navigation.

The beginning of Show Session is now a **Companion Home** showing:

- Current active TEW snapshot
- Current planned show
- Current Show Session step
- Next scheduled show
- Shows awaiting TEW results
- Shows awaiting reconciliation
- Shows with Post-Show Wrap-Up pending
- Deferred Promotion Calendar obligations
- Unresolved championship decisions
- Unresolved competition results
- Most recent complete backup
- Snapshot Vault storage usage

The primary daily actions are:

- Continue Current Show
- Import Updated TEW Snapshot
- Review New TEW Results
- Finish Post-Show Wrap-Up
- Open Promotion Calendar
- Export Complete Backup

## Persistent TEW Snapshot Vault

Imported TEW snapshots are parsed in the browser and preserved in **IndexedDB**, so the active read-only snapshot remains available after refreshing the forwarded Codespaces preview.

Each stored snapshot records:

- File name and size
- Database-created date when available
- Import date and time
- Content fingerprint
- Snapshot role
- Notes
- Table and mapped-table counts
- Worker count
- Historical show and match counts
- Storyline count
- Mapping warnings
- Mapping-confidence summary
- Estimated parsed storage size

Snapshot roles are:

- Current TEW Save
- Baseline
- Before Show
- After Show
- Historical Reference
- Unclassified

### Snapshot safety

- The original MDB or ACCDB is never modified.
- Parsed snapshot data is stored separately from creative tracker data.
- Duplicate supported content is detected by fingerprint.
- The active snapshot can be changed explicitly.
- Removing a snapshot never deletes planned shows, Match Stories, Angle Outputs, or other creative records.
- Retention limits protect the active, baseline, post-show, and reconciliation snapshots.
- Snapshot Vault contents can be exported and restored separately.

## Read-only snapshot comparison

Two stored snapshots can be compared without modifying either one.

The comparison reports only fields supported by the current reader:

- Newly detected historical shows
- Removed historical shows
- Changed attendance, show rating, venue, company, or broadcast fields
- Newly detected matches
- Changed winners, match ratings, durations, descriptions, or notes
- Newly detected workers
- Workers no longer detected
- Newly detected storylines
- Storyline status, heat, description, name, or participant changes
- Mapper-table changes
- Added or resolved mapping warnings

The comparison does not claim to import contracts, finances, morale, company-roster membership, or title ownership because those fields are not currently verified by the read-only reader.

## Guided promotion onboarding

Promotion Onboarding establishes the companion’s working identity without inventing TEW data.

### Promotion identity

The user confirms:

- Promotion name
- Abbreviation
- Default brand
- Default weekly show
- Default show length
- Calendar start date
- Active TEW snapshot

Company names detected in imported show history are offered only as candidates and require confirmation.

### Worker identity review

For every supported TEW worker identity, the user may:

- Confirm an exact TEW worker-ID link
- Link an existing profile manually
- Create an identity-only profile
- Ignore the worker
- Resolve ambiguous duplicate-name matches

Identity-only profiles are marked **Ratings Incomplete**. Existing ratings, workbook imports, provenance, and manual overrides are preserved. The snapshot never invents match-approach ratings.

### Storyline identity review

For every supported TEW storyline, the user may:

- Link an existing tracker storyline
- Create a tracker storyline from supported TEW fields
- Update imported status, heat note, and participant references only
- Preserve it as historical-only TEW evidence

Creating a tracker storyline copies only supported imported data such as name, description, status, heat note, and participants. It does not invent the premise, motivations, climax, ending, aftermath, or future milestones.

## Unified Show Session

The normal show workflow remains:

**Setup → Approaches & Output → Production Package → TEW Entry → Result → Post-Show Wrap-Up**

Every segment has one visible operational state:

- Not Started
- Setup Incomplete
- Creative In Progress
- Ready for TEW
- Entering in TEW
- Entered
- Awaiting Result
- Reconciliation Needed
- Reconciled

The selected show, segment, and exact workflow step are saved in browser data.

### Match workflow

A match can retain:

- Wrestlers, roles, and sides
- Match type and duration
- Championship or competition stakes
- Planned winner and finish
- Match aim
- Duration-controlled wrestler approaches
- Pace and stamina information
- Match Story
- Key moments and road-agent phase map
- Road-Agent Match Package
- Direct TEW fields
- Suggested TEW notes
- Companion-only strategy
- Actual TEW result after reconciliation

### Angle workflow

An angle can retain:

- Participants and roles
- Location and content type
- Story purpose
- Consequences and follow-up
- Audience takeaway
- Complete Angle Segment Output
- Angle Production Package
- Direct TEW fields
- Suggested TEW notes
- Final reviewed angle record

The companion never invents dialogue, actions, winners, finishes, or outcomes that were not entered by the user or supplied by the actual TEW result.

## Match approaches

The Workbench supports nineteen match aims, fifteen canonical approaches, eighteen wrestler skills, combination-level recommendations, manual locks, pace evaluation, stamina cost, and optional advisory performance previews.

Approach slots remain:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

TEW remains authoritative for the actual result and match rating.

## Automatic Output Library lineage

Formal permanent checkpoints are available at:

**Plan → Generated Draft → Applied Output → Ready for TEW → Entered in TEW Version → Reconciled Actual Version**

Before saving, the companion shows what changed. Identical versions are blocked. Earlier versions are never overwritten.

The Output Library also preserves:

- Road-Agent Match Packages
- Angle Production Packages
- Show-wide production packets
- Reusable output structures
- Planned-versus-actual reports
- Phrase-source transparency

## Assisted TEW entry

Information remains separated into:

1. **Direct TEW Field** — a value with a TEW booking equivalent.
2. **TEW Notes** — Match Story, Angle Output, key moments, consequences, and production guidance.
3. **Companion Only** — approaches, pace, stamina, compatibility, and advisory information TEW cannot directly represent.

Field states are:

- Pending
- Copied
- Entered
- Changed in TEW
- Not Applicable

A last-minute TEW change can preserve the original tracker value, actual entered value, reason, whether the tracker plan changed, and whether another permanent version is required.

## Promotion Calendar

The Promotion Calendar supports:

- Weekly, biweekly, monthly, premium, competition, special, one-off, and custom show series
- Preview-before-create schedule generation
- Episode numbering
- Excluded dates
- Rescheduled shows
- One-off premium events
- Structural card templates
- Direct Show Session navigation
- Grounded booking obligations
- Competition scheduling
- Cross-show integrity warnings

A weekly 60-minute show can be configured as **PWL Power Hour** without hardcoding the application around PWL.

Promotion stages remain:

- Scheduled
- Card Started
- Creative In Progress
- Ready for TEW
- Entering in TEW
- Awaiting Results
- Reconciliation Needed
- Reconciled

The stage is derived from the actual card and Show Session data.

## Post-Show Wrap-Up

A reconciled TEW show remains operationally unfinished until Post-Show Wrap-Up is reviewed.

Wrap-Up includes:

- Final Match Story and Angle Output review
- Yes, Partially, No, or Unresolved planned-outcome status
- Actual angle rating when manually recorded
- Reconciled Actual Version checkpoints
- Explicit championship result confirmation
- Explicit Cup, League, tournament, or Classic result confirmation
- Storyline milestone review
- Booking-idea review
- Character-arc progress notes
- Grounded follow-up rollforward
- Permanent Show Closure Report
- Audit history
- Pre-Wrap-Up recovery snapshot
- Rollback before closure
- Correction amendments after closure

No championship, competition, storyline, booking-idea, or character-arc consequence is applied without explicit confirmation.

## Wrestler Profile Library

The profile library supports reusable match-approach profiles and browser-side read-only import from:

- `.xlsx`
- `.xlsm`
- `.csv`
- Tracker profile `.json`

Workbook macros are never executed. Manual overrides are preserved by default. Every field retains its provenance.

## Data and Backup Center

The Data Center provides:

- Export Complete Companion Backup
- Preview backup before restoration
- Restore after explicit confirmation
- Automatic local pre-restore safety point
- Export Snapshot Vault Package
- Import Snapshot Vault Package
- Clear creative tracker data separately
- Clear parsed snapshot data separately
- Retention and storage-warning settings

### Backup version 22

Version 22 preserves:

- All planned shows and reconciliations
- Match approaches and profiles
- Match Stories and Angle Outputs
- Output Library lineage and production packages
- TEW handoff and transfer progress
- Show Session position
- Promotion Calendar, show series, templates, and obligations
- Championships and competitions
- Storylines, booking ideas, worker profiles, and arcs
- Post-Show Wrap-Up sessions, decisions, Closure Reports, audits, and amendments
- Snapshot Vault manifest
- Active snapshot ID and snapshot roles
- Snapshot comparison history
- Promotion onboarding state
- Worker and storyline identity decisions
- Companion Home and Data Center settings

Versions 1 through 20 remain importable.

The normal backup intentionally stores the Snapshot Vault **manifest**, not every large parsed snapshot. Export the separate Snapshot Vault package when the parsed TEW history must also be moved to another Codespaces preview origin.

## Daily workflow

### Before booking

1. Open the forwarded Codespaces preview.
2. The active parsed TEW snapshot is restored automatically.
3. Review Companion Home for the next action.
4. Open the current or next scheduled show.
5. Book matches and angles.
6. Select match approaches.
7. Complete Match Stories and Angle Outputs.
8. Prepare the production and TEW-entry package.

### After running the show in TEW

1. Import the updated read-only MDB snapshot.
2. Review newly detected TEW history.
3. Confirm the completed show and match links.
4. Reconcile actual winners and ratings from TEW.
5. Complete Post-Show Wrap-Up.
6. Roll grounded follow-ups into a future show.
7. Continue to the next scheduled card.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- No workbook macros are executed.
- No missing wrestler ratings are invented.
- No contracts, finances, morale, worker development, AI-controlled companies, or independent wrestling world is added.
- No show, match, angle, winner, finish, dialogue, rating, title change, competition result, or storyline development is invented automatically.
- Reconciled TEW results remain authoritative.
- Snapshot deletion never deletes creative history.
- Creative tracker clearing and Snapshot Vault clearing are separate deliberate actions.

## Open in GitHub Codespaces

1. Open this repository in GitHub.
2. Choose **Code → Codespaces → Create codespace on the current branch**.
3. Wait for dependency installation to finish.
4. Run `npm run dev` in the Codespace terminal.
5. Open the forwarded **TEW Story Tracker Preview** port.

Before deleting a Codespace or moving to a different forwarded preview origin, export:

1. A complete **version 22 companion backup**.
2. A separate **Snapshot Vault package** when stored parsed TEW snapshots must also move.

Never commit a TEW `.mdb` or `.accdb` file to GitHub.

## Verification

```bash
npm test
npm run build
npm run test:browser
```

GitHub Actions runs all three checks for every pull request.
