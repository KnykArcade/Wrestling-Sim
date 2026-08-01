# Phase 1 Browser Runtime Fix

This correction addresses the blank Codespaces preview reported after Phase 1 was merged.

## Changes

- The application shell now starts independently from the Access database reader.
- `mdb-reader` and the browser Buffer compatibility package are loaded only after a database file is selected.
- Startup and React render failures display a visible diagnostic screen instead of an unexplained blank page.
- A Playwright Chromium test opens the production preview and verifies that the title, MDB import heading, and file-selection button render without browser console or page errors.
- GitHub Actions now runs the browser test in addition to unit tests and the production build.

## Safety boundary

The correction does not change TEW data mapping, write to a TEW database, upload database bytes, or modify the TEW executable.
