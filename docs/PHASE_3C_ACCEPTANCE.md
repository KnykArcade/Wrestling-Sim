# Phase 3C Acceptance Criteria

## Creative Control Center

- The application opens on a universe dashboard.
- Upcoming shows display readiness scores and their most important outstanding issue.
- Completed shows awaiting reconciliation, active storylines, open ideas, due milestones, and continuity warnings are surfaced.
- Dashboard items open the relevant show or creative workspace.

## Future Booking Board

- Booking ideas can be created, edited, prioritized, delayed, cancelled, archived, and moved through Inbox, Developing, Ready, Scheduled, and Completed.
- Ideas support match, angle, promo, debut, return, turn, betrayal, title change, challenge, reveal, mystery, interference, injury story, and custom types.
- Ideas retain target dates, target shows, workers, storylines, championships, concept, purpose, consequences, follow-up, and private notes.
- A ready idea can be converted into a planned match or angle.
- Conversion preserves the original idea reference and blocks duplicate scheduling.

## Calendar, readiness, continuity, and search

- The creative calendar combines shows, storyline milestones, worker arcs, and booking ideas in date order.
- Show readiness checks time, missing narratives, workers, storyline links, assigned ideas, and assigned milestones.
- Cross-system warnings cover unscheduled active storylines, active worker arcs without appearances, broken milestone and idea links, unfinished completed ideas, and unscheduled title changes.
- Global search covers shows, segments, narratives, storylines, milestones, workers, arcs, relationships, and booking ideas.

## Persistence and safety

- Booking ideas and dashboard settings save automatically in browser storage.
- Version 6 backups contain shows, reconciled history, storylines, workers, relationships, character arcs, booking ideas, and control settings.
- Backup versions 1 through 5 remain importable.
- No TEW database or executable writes are introduced.

## Verification

- Unit tests cover conversion, duplicate protection, readiness, calendar ordering, warnings, global search, storage normalization, and backup migration.
- Browser tests cover planning, storylines, workers, booking-idea scheduling, global search, persistence, and MDB compatibility.
