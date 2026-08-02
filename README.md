# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, selecting match approaches, generating Match Stories and Angle Segment Outputs, preparing road-agent packages, assisting TEW entry, and preserving permanent creative history.

**TEW remains the game.** The companion does not replace TEW’s contracts, finances, company simulation, wider world, actual match results, or ratings. MDB and ACCDB access remains read-only.

## Phase 5G: Unified Show Session and Automatic Output Lineage

The default **Show Session** workspace connects the complete companion workflow around one planned show:

**Setup → Approaches & Output → Production Package → TEW Entry → Result**

The selected show, segment, and workflow step are saved so an interrupted session can resume at the exact point where work stopped.

### Show-session overview

Each show displays:

- Complete running order
- Match and angle count
- Planned runtime
- Segment-setup completion
- Match-approach completion
- Match Story and Angle Output completion
- Current production-package count
- TEW-entry progress
- Reconciliation progress
- The next unfinished segment

Previous, next, and next-unfinished controls make it possible to work through the card in order without jumping between unrelated screens.

### Segment workflow states

Every segment has one visible status:

- Not Started
- Setup Incomplete
- Creative In Progress
- Ready for TEW
- Entering in TEW
- Entered
- Awaiting Result
- Reconciliation Needed
- Reconciled

The status is derived from the real segment data, approach setup, Output Library record, TEW-entry progress, and confirmed result state.

### Connected match workflow

A selected match keeps the following in one session:

- Wrestlers, roles, and sides
- Match type and duration
- Championship or competition stakes
- Planned winner and finish
- Match aim
- Duration-controlled approach selection
- Pace and stamina information
- Match Story and key moments
- Road-Agent Match Package
- Direct TEW fields and suggested TEW notes
- Companion-only strategy
- Actual TEW result after reconciliation

### Connected angle workflow

A selected angle keeps the following together:

- Participants and roles
- Location and content type
- Story purpose
- Consequences and follow-up
- Audience takeaway
- Angle Segment Output
- Angle Production Package
- Direct TEW fields and suggested TEW notes
- Reconciled show history

The companion does not invent dialogue, actions, winners, or outcomes that were not entered in the creative plan.

### Automatic Output Library checkpoint offers

The session offers a permanent checkpoint when a segment reaches a formal stage:

**Generated Draft → Applied Output → Ready for TEW → Entered in TEW Version → Reconciled Actual Version**

Before saving, the session shows the fields that changed. Identical checkpoint versions are blocked, and dismissing an offer hides it only until the segment changes again. Earlier versions are never overwritten.

### Inline assisted TEW entry

The selected segment can be entered without leaving Show Session. Information remains divided into:

1. **Direct TEW Field** — fields with an equivalent TEW booking value.
2. **TEW Notes** — Match Story, Angle Output, key moments, consequences, and production guidance.
3. **Companion Only** — match approaches, pace, stamina, style compatibility, and advisory information that TEW does not directly represent.

Field statuses are:

- Pending
- Copied
- Entered
- Changed in TEW
- Not Applicable

The full TEW Transfer workspace remains available for detailed handoff research and exports.

### Changes made during TEW entry

A last-minute TEW change can preserve:

- Original tracker value
- Value actually entered in TEW
- Reason for the change
- Whether the tracker plan was updated
- Whether a new frozen or Output Library version is required
- Date and time of the recorded change

The original plan remains in permanent history.

### Post-show result intake

After the show runs in TEW, the same session can load the updated read-only database copy and suggest:

- The completed TEW show
- The matching result for each planned match
- Running-order evidence
- Participant overlap
- Winner, duration, rating, and notes

Every suggested match link must be confirmed or rejected. Confirmed results update tracker reconciliation, but TEW remains authoritative for the actual winner and rating.

### Quick Segment connection

A Quick Match or Quick Angle can be added to the current show as a linked copy. The original standalone Quick Segment remains unchanged, while the show copy gains running-order placement, entry tracking, reconciliation, and permanent Output Library lineage.

### Recovery and integrity checks

Show Session detects or surfaces:

- Duplicate segment identifiers
- A removed saved-resume segment
- Orphaned TEW-entry progress
- Output records linked to removed segments
- Missing permanent lineage after entry begins
- Production packages made stale by later card edits
- Browser-storage usage

## Companion Core navigation

The daily navigation now centers on:

1. **Show Session**
2. **Match & Angle Workbench**
3. **Output Library**
4. **Wrestler Profiles**
5. **TEW Entry**
6. **Results**

Legacy Show Operations diagnostics, Planned Shows, championships, competitions, storylines, worker creative profiles, formulas, handoff research, and read-only database diagnostics remain available through Advanced Tools.

## Match & Angle Workbench

The Workbench supports standalone Quick Matches and Quick Angles as well as complete planned-show cards.

Matches can use:

- Nineteen match aims
- Fifteen canonical approaches
- Eighteen wrestler skills
- Duration-controlled approach slots
- Combination-level approach AI
- Manual approach locks and replacements
- Pace and stamina evaluation
- Optional advisory performance previews
- Editable Match Story phases and key moments

Approach slots remain:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

## Output Library and production packages

The Output Library preserves:

- Original plan
- Generated drafts
- Applied output
- Ready-for-TEW checkpoint
- Entered-in-TEW version
- Reconciled actual version
- Road-Agent Match Package or Angle Production Package
- Show-wide production packets
- Reusable output structures
- Planned-versus-actual reports

Every output version identifies whether wording came from the canonical approach phrase library, the entered creative plan, or a generic structural fallback.

## Wrestler Profile Library

The roster profile library stores reusable match-approach ratings and field-level provenance. It supports browser-side, read-only import from:

- `.xlsx`
- `.xlsm`
- `.csv`
- Tracker profile `.json`

Workbook macros are never executed. Manual overrides are preserved by default, and complete import sessions can be reviewed or rolled back.

## Guarded TEW transfer

The assisted transfer workspace orders the finalized card for TEW entry and classifies information as Direct TEW Field, TEW Notes, or Companion Only.

Raw before-and-after database research remains read-only. The installed Access reader does not provide a verified writer, so direct MDB or ACCDB modification remains disabled.

## Backup format

Backup version **18** preserves:

- Planned shows and reconciliation
- Exact Show Session resume state
- Formal checkpoint history and dismissed offers
- Awaiting-result and snapshot references
- Storylines, workers, championships, and competitions
- TEW handoff, transfer, and operations data
- Match-engine profiles and approach setup
- Quick Segments and draft history
- Wrestler Profile Library and import sessions
- Output Library items and complete version lineage
- Road-agent and angle production packages
- Show-wide production packets
- Reusable output structures
- Planned-versus-actual reports

Versions 1 through 17 remain importable.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- No workbook macros are executed.
- No missing wrestler ratings are invented.
- No output database is produced without a verified Access writer and complete evidence gates.
- No contracts, finances, morale system, worker development, AI-controlled companies, or independent wrestling world is added.
- No winner, rating, or TEW result is automatically changed.
- Reconciled TEW results remain authoritative.
- Browser data saves automatically to the current cloud-preview origin.

## Open in GitHub Codespaces

1. Open this repository in GitHub.
2. Choose **Code → Codespaces → Create codespace on the current branch**.
3. Wait for dependency installation to finish.
4. Run `npm run dev` in the Codespace terminal.
5. Open the forwarded **TEW Story Tracker Preview** port.

Export a complete version 18 backup before deleting a Codespace or moving to another Codespaces URL. Never commit a TEW `.mdb` or `.accdb` file to GitHub.

## Verification

```bash
npm test
npm run build
npm run test:browser
```

GitHub Actions runs all three checks for every pull request.
