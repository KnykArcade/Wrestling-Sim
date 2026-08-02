# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for match approaches, Match Stories, Angle Segment Outputs, road-agent packages, planned cards, assisted TEW entry, competitions, and permanent creative history.

**TEW remains the game.** The companion does not replace TEW’s contracts, finances, company simulation, wider world, actual match results, or ratings.

## Phase 5F: Output Library and Road-Agent Workflow

The new **Output Library** preserves creative work beyond the current draft and gives every saved segment a visible version history:

**Plan → Generated Draft → Applied Output → Entered in TEW Version → Reconciled Actual Version**

The original plan is never silently overwritten.

### Central Output Library

Saved matches and angles retain:

- Match Story or Angle Segment Output
- Key moments and road-agent map
- TEW-notes version
- Full creative version
- Wrestlers, roles, and sides
- Match aim and selected approaches
- Planned winner and finish
- Championship, competition, storyline, and show links
- Draft and revision lineage
- Reconciliation status and actual TEW result

The library can be searched by wrestler, show, segment type, match aim, approach, championship, competition, storyline, or date.

### Road-Agent Match Package

Every saved match receives a package divided into three clear groups:

1. **Direct TEW fields** — match identity, participants, match type, duration, championship or competition stakes, winner, and finish.
2. **Suggested TEW notes** — Match Story, key moments, interference, post-match activity, consequences, and follow-up.
3. **Companion-only strategy** — match aim, wrestler approaches, pace, stamina costs, and any advisory preview.

The package can be copied as a concise TEW handoff or as a complete production document.

### Angle Production Package

Angles receive the same structured treatment:

- Participants and roles
- Location and content type
- Story purpose
- Required output
- Consequences and follow-up
- Audience takeaway
- TEW-notes version
- Full creative and production guidance

The companion does not invent dialogue or actions that were not entered in the plan.

### Show-wide production packets

A planned show can generate one ordered packet containing:

- Show identity and running order
- Every match package
- Every angle package
- Missing-output and missing-participant warnings
- TEW-entry guidance
- Post-show reconciliation checklist
- Clean text export
- Structured JSON export

### Reusable output structures

Any saved output can become a reusable structure. The structure keeps duration, format, purpose, and required sections while removing:

- Wrestler names
- Planned winner
- Championship name
- Dialogue
- Specific storyline outcome

### Source transparency

Every output version identifies whether its wording came from:

- The canonical approach phrase library
- The entered creative plan
- A generic structural fallback

Approaches without a supplied canonical phrase row remain explicitly labeled rather than receiving invented source language. Current fallback approaches include:

- Dirty Rulebreaker
- Resilient Underdog
- Strong Style Specialist

### Planned versus actual reporting

After TEW reconciliation, a saved match compares:

- Planned winner versus actual winner
- Planned duration versus actual duration
- Planned finish versus TEW result notes
- Advisory preview versus TEW rating
- Planned Match Story versus final narrative
- Planned consequences and follow-up versus confirmed outcomes

TEW remains authoritative for the actual result and rating.

## Companion Core navigation

The daily workflow centers on:

1. **Show Operations**
2. **Match & Angle Workbench**
3. **Output Library**
4. **Wrestler Profiles**
5. **TEW Entry**
6. **Results**

Advanced tools remain available for planned shows, championships, competitions, storylines, worker creative profiles, formulas, handoff research, and read-only TEW diagnostics.

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

The Workbench now includes a direct **Save Current Segment to Output Library** action.

## Wrestler Profile Library

The roster profile library stores reusable match-approach ratings and provenance for every wrestler.

It supports browser-side read-only import from:

- `.xlsx`
- `.xlsm`
- `.csv`
- Tracker profile `.json`

Workbook macros are never executed.

Every rating is labeled as one of:

- Imported from workbook
- Imported from TEW
- Mapped from TEW
- Derived
- Manual override
- Missing
- Baseline placeholder

Manual overrides are preserved by default. Import sessions retain conflict decisions and can be rolled back.

## Unified Show Operations

Each show follows:

**Draft → Creative Ready → Handoff Ready → Entering in TEW → Entered → Awaiting Results → Reconciliation Needed → Reconciled**

The workspace checks card identity, runtime, repeated worker use, match setup, approaches, stamina, Match Stories, Angle Outputs, title stakes, competition links, handoff age, transfer age, and reconciliation status.

## Guarded TEW transfer

The assisted transfer workspace orders the finalized card for TEW entry and classifies information as:

- Direct TEW Field
- TEW Notes
- Companion Only

Raw before-and-after database research remains read-only. The installed Access reader does not provide a verified writer, so direct MDB or ACCDB modification remains disabled.

## Backup format

Backup version **17** preserves:

- Planned shows and reconciliation
- Storylines, workers, championships, and competitions
- TEW handoff, transfer, and operations data
- Match-engine profiles and approach setup
- Quick Segments and draft history
- Wrestler Profile Library and import sessions
- Output Library items and version lineage
- Road-agent and angle production packages
- Show-wide production packets
- Reusable output structures
- Planned-versus-actual reports

Versions 1 through 16 remain importable.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- No workbook macros are executed.
- No missing wrestler ratings are invented.
- No output database is produced without a verified Access writer and complete evidence gates.
- No contracts, finances, morale system, worker development, or independent wrestling world is added.
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
