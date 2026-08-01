# TEW IX Story Tracker

A browser-based companion for **Total Extreme Wrestling IX** that preserves booking plans, match stories, angle outputs, planned-versus-actual show history, storyline continuity, worker creative profiles, future booking ideas, championship lineage, rankings, TEW handoff packages, and the foundation of a native match simulation engine without changing TEW's executable or live save files.

## Phase 4C1: Native Match Engine Data Foundation

The new **Match Engine** workspace converts the uploaded match-system documents and workbooks into a typed, testable application catalog.

### Canonical approaches

The engine now contains fifteen canonical approaches:

- Aerial Showstopper
- Big Match Performer
- Chain Technician
- Dirty Rulebreaker
- Hardcore Daredevil
- Heavy Striker / Brawler
- High Tempo Hybrid
- Opportunistic Schemer
- Pace Controller
- Power Dominance
- Psychological Manipulator
- Resilient Underdog
- Showman
- Strong Style Specialist
- Submission Specialist

Every approach stores its four weighted wrestler skills, pace value, stamina cost, source names, source notes, and available narrative phrases. The interactive formula inspector calculates an approach rating from editable wrestler-skill values.

### Duration-based approach slots

The approved rules are now authoritative:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

Legacy importance-based approach counts are retained for workbook parity and diagnostics but do not override these duration boundaries.

### Match aims, pace, stamina, and mental states

The catalog preserves nineteen combined match aims with style, ideal pace, best-fit wrestler styles, and clash styles.

Pace evaluation reproduces the workbook statuses and modifiers:

- Ideal Pace: +2
- Open Pace: 0
- Off Pace: -5
- Noticeably Off: -10
- Poor Pacing: -15
- Bad Pacing: -20
- Failed: -25

Stamina evaluation reproduces Pass, Winded, Gassed, and Dead states. The five mental states remain Hot Night, Focused, Neutral, Distracted, and Off Night with the original modifiers and score thresholds.

### Explicit source reconciliation

Source differences are not silently discarded:

- `Aerial Specialist` maps to Aerial Showstopper.
- `Heavy Striker/Brawler` maps to Heavy Striker / Brawler.
- `Workrate Machine` maps to High Tempo Hybrid.
- `Counter Specialist` and `Ring General` remain visible as unresolved legacy records because the fifteen-approach definition document does not define them.
- Pace Controller retains a documented source conflict between pace 0 and pace 1; pace 1 is canonical because it is the active Data-table lookup value.

The Source Reconciliation screen shows every alias, unresolved record, source conflict, and preserved legacy importance profile.

## Phase 4B: TEW Show Handoff and Entry Assistant

Planned shows can be finalized into immutable numbered handoff versions. The handoff workspace preserves the running order, workers, roles, match settings, championship stakes, finishes, narratives, follow-ups, and road-agent notes.

The guided TEW Entry Assistant supports field-by-field or full-segment copying, saved progress, reusable TEW mappings, missing-record warnings, show-level entry checklists, version comparisons, JSON/text/Markdown exports, and printable booking sheets.

TEW MDB/ACCDB access remains read-only.

## Championship and creative systems

- Championship Hub with reigns, vacancies, defenses, rankings, programs, timelines, and result confirmation
- Creative Control Center with upcoming shows, readiness, continuity warnings, calendar, ideas, and global search
- Planned-show workspace with ordered matches and angles
- Full Match Story and Segment Output editors
- Planned-to-actual show and match reconciliation
- Storyline Hub, milestones, and chronological timelines
- Worker creative profiles, statistics, character arcs, relationships, and comparison history

## Next match-engine phases

- **Phase 4C2:** Match Setup and Approach AI
- **Phase 4C3:** Match Simulation and Outcome Engine
- **Phase 4C4:** Narrative and Universe Integration

These phases will build on the canonical data foundation rather than reimplementing spreadsheet formulas independently.

## Backups

Version 8 backups include planned and reconciled shows, tracker storylines, worker data, booking ideas, championships, and TEW handoff versions, mappings, checklists, and progress.

Phase 4C1 adds static source catalogs and does not require a new backup version.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
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
