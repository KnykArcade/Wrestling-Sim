# Phase 3B Acceptance — Worker Creative Profiles and Relationship Network

## Worker directory

- Discovers names from imported TEW workers, planned shows, reconciled results, and tracker storylines.
- Deduplicates matching names while preserving TEW links.
- Supports manual character creation and source filtering.

## Creative profiles

- Stores role, alignment, brand, gimmick, motivation, objective, direction, notes, and TEW link.
- Persists automatically in browser storage.
- Historical show records remain separate from editable profile data.

## Creative history and statistics

- Collects every planned and reconciled appearance.
- Shows planned narrative, final narrative, result, rating, storyline, consequences, and follow-up.
- Calculates appearances, matches, angles, wins, losses, unresolved results, average ratings, last appearance, next appearance, and streaks only from available data.

## Character arcs

- Supports multiple arcs per worker.
- Stores conflict, turning point, resolution, aftermath, storyline, target show, and target date.

## Relationships and comparison

- Stores typed two-person relationships with status, importance, descriptions, notes, storyline, and history.
- Compares shared segments, shared storylines, recorded wins, first and latest interaction, and next booking.

## Continuity warnings

- Missing future booking in an active storyline.
- Inactivity beyond a configurable threshold.
- Arc without a next step.
- Broken worker or storyline relationship links.
- Betrayal without aftermath.
- Conflicting active-storyline roles.
- Possible manual/imported duplicate.

## Backup and safety

- Version 5 backups include shows, reconciliations, storylines, worker profiles, arcs, and relationships.
- Versions 1 through 4 remain importable.
- No TEW database writes.
- No TEW executable changes.
