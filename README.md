# TEW IX Story Tracker

A browser-based companion for **Total Extreme Wrestling IX** that preserves booking plans, match stories, angle outputs, planned-versus-actual show history, storyline continuity, worker creative profiles, future booking ideas, championship lineage, rankings, and competitive records without changing TEW's executable or live save files.

## Phase 4A: Championship Hub, Rankings, and Competitive Records

The **Championships** workspace creates a permanent competitive structure around the existing show, storyline, worker, and reconciliation systems.

### Championship Hub

Each tracker championship stores:

- Name, company, brand, division, and classification
- Active, inactive, or vacant status
- Current and previous champions
- Date won and recorded defenses
- Optional TEW title reference and legacy names used on older cards
- Linked storyline and current title program
- Private booking notes and inactivity threshold

Imported TEW references remain read-only. A tracker championship can recognize older free-text title names so existing planned cards are not lost.

### Reigns and lineage

Lineage records retain champions, previous champions, start and end dates, title-winning and title-ending shows and segments, successful defenses, vacancy reasons, notes, and corrections.

Reconciled championship matches create **result suggestions**, not automatic title changes. The user must explicitly confirm a retention, title change, vacancy, or unresolved result before the tracker updates the championship lineage.

### Competitive records and rankings

Worker records are calculated only from completed match information the tracker actually possesses:

- Wins, losses, draws, no contests, and unresolved results
- Singles and team appearances when participant counts support the distinction
- Championship-match record
- Last five results and current streak
- Recorded results against specific opponents

Rankings are fully editable. Suggestions use visible stored results and activity, explain why each contender was suggested, and preserve manually locked entries. There is no hidden rating formula.

### Championship program and timeline

A title program can connect the champion, leading challenger, additional contenders, storyline, booking ideas, and target payoff show. The championship timeline combines reigns, defenses, vacancies, planned title matches, storyline links, booking ideas, and ranking updates.

Integrity warnings identify multiple active reigns, missing champions, unresolved title results, vacant titles without a plan, inactive reigns, and leading contenders without bookings.

## Creative Control Center

The universe-wide control center connects the planning systems and surfaces upcoming shows, reconciliation needs, active storylines, milestones, open ideas, worker arcs, continuity warnings, and recent history.

Booking ideas can be created before assignment to a show and converted directly into planned matches or angles. The tracker carries workers, roles, storyline links, narrative, purpose, consequences, follow-up, championship details, and the original booking-idea reference into the segment. Duplicate scheduling is blocked.

## Existing systems

- Planned-show workspace with ordered matches and angles
- Full Match Story and Segment Output editors
- Copy-ready TEW entry summaries
- Read-only TEW MDB/ACCDB snapshot import
- Planned-to-actual show and match reconciliation
- Permanent enhanced show history
- Storyline Hub, milestones, and chronological timelines
- Worker creative profiles, statistics, character arcs, relationships, and comparison history
- Future Booking Board, creative calendar, readiness checks, and global search

## TEW handoff and integration boundary

The intended workflow is:

1. Build the card, match stories, angle outputs, workers, storylines, finishes, and title stakes in this tracker.
2. Use the copy-ready TEW summaries while entering the show into TEW.
3. Run the show in TEW.
4. Import the updated TEW MDB snapshot back into the tracker.
5. Reconcile actual results and confirm championship changes.

Directly writing a completed card into a live TEW save is **not implemented**. Snapshot access remains read-only because uncontrolled writes to a live Access database could corrupt the save or create records TEW does not accept. A future handoff phase can add structured export, field-by-field entry assistance, and—only if a documented safe route is verified—a guarded write/import bridge using backups and validation.

## Backups

Version 7 backups include:

- Planned and reconciled shows
- Tracker storylines and milestones
- Worker profiles, arcs, and relationships
- Booking ideas and Creative Control Center settings
- Championships, reigns, rankings, title programs, and result confirmations

Backup versions 1 through 6 remain importable with safe empty defaults for systems that did not yet exist.

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
