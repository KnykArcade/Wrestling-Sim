# Phase 1 Acceptance Checklist

Phase 1 is complete when the following checks pass against an MDB snapshot generated from an active TEW IX save.

## Safety boundary

- The application opens the database without modifying its file timestamp or contents.
- No network request contains the database bytes.
- Closing the browser session clears all imported records from application memory.
- The repository contains no TEW database or executable files.

## Import

- The file name and size are displayed.
- The table inventory lists table names, row counts, and column names.
- Recognized TEW history tables are marked as mapped.
- Unsupported or missing tables produce explicit warnings.

## Show history

- Previous shows appear in descending date order when dates are available.
- Selecting a show displays its rating, attendance, venue, company, and broadcast details when present.
- Match records link to the correct show through the saved show identifier.
- Match descriptions, ratings, winners, times, placement, and existing notes are displayed when present.
- Participant names resolve through the worker table when the match-participant table contains only worker identifiers.

## Storylines

- Player storyline records are displayed when present.
- Database storyline records are available as a fallback.
- Storyline participants resolve through the involvement and worker tables when those links exist.
- The application does not invent descriptions, participants, ratings, or statuses when the source fields are absent.

## Engineering checks

- `npm test` passes.
- `npm run build` passes.
- GitHub Actions completes successfully.
