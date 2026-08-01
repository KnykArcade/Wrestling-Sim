# TEW IX Story Tracker

A browser-based companion for **Total Extreme Wrestling IX** that preserves booking plans, match stories, angle outputs, planned-versus-actual show history, storyline continuity, worker creative profiles, and future booking ideas without changing TEW's executable or save files.

## Phase 3C: Creative Control Center

The application now opens on a universe-wide control center that connects every existing planning system.

### Universe dashboard

The dashboard surfaces:

- Upcoming planned shows and readiness scores
- Completed shows awaiting reconciliation
- Active storylines and milestones due soon
- Open booking ideas
- Worker arcs without upcoming appearances
- Cross-system continuity warnings
- Recently completed shows

Every actionable item links back to its related show, storyline, worker, or booking idea.

### Future Booking Board

Booking ideas can be created before they are assigned to a show. Supported types include matches, angles, promos, debuts, returns, turns, betrayals, title changes, challenges, reveals, mysteries, interference, injury stories, and custom concepts.

Each idea stores its status, priority, target date, target show, workers, storylines, championship, full concept, creative purpose, consequences, follow-up, and private notes.

Ideas move through:

`Inbox → Developing → Ready → Scheduled → Completed`

They can also be delayed, cancelled, or archived.

A ready idea can be converted directly into a planned match or angle. The tracker carries workers, roles, storyline links, narrative, purpose, consequences, follow-up, championship details, and the original booking-idea reference into the segment. Duplicate scheduling is blocked.

### Creative calendar

The calendar combines, in date order:

- Planned and reconciled shows
- Storyline milestones
- Worker character-arc targets
- Booking ideas

Filters can isolate shows, milestones, arcs, or ideas.

### Show readiness and continuity

Upcoming shows are checked for:

- Planned time versus expected time
- Missing Match Stories or Segment Outputs
- Segments without workers
- Storyline consequences without storyline links
- Ideas assigned to the show but not added to the card
- Storyline milestones assigned to the show but absent from the card

The continuity center also identifies active storylines with no next segment, active character arcs without upcoming appearances, broken show links, completed ideas without segments, and title-change ideas without scheduled title matches. Warnings remain advisory and never block booking.

### Global search

Global search covers shows, segments, Match Stories, Segment Outputs, storylines, milestones, workers, character arcs, relationships, and booking ideas.

## Existing systems

- Planned-show workspace with ordered matches and angles
- Full Match Story and Segment Output editors
- Read-only TEW MDB/ACCDB import
- Planned-to-actual show and match reconciliation
- Permanent enhanced show history
- Storyline Hub, milestones, and chronological timelines
- Worker creative profiles, statistics, character arcs, relationships, and comparison history

## Backups

Version 6 backups include:

- Planned and reconciled shows
- Tracker storylines and milestones
- Worker profiles, arcs, and relationships
- Booking ideas and Creative Control Center settings

Backup versions 1 through 5 remain importable with safe empty defaults for systems that did not yet exist.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or save-file mutation is performed.
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
