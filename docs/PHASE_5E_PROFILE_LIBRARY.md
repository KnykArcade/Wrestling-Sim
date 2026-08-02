# Phase 5E — Wrestler Profile Library and Bulk Ratings Import

Phase 5E keeps Total Extreme Wrestling IX authoritative while making the tracker-side match-approach profiles practical for a full roster.

## Daily workflow

1. Open **Wrestler Profiles**.
2. Create profiles manually or import `.xlsx`, `.xlsm`, `.csv`, or tracker profile `.json` data.
3. Select the worksheet and header row.
4. Map source columns to the central profile fields.
5. Review duplicate names, TEW worker IDs, invalid ratings, unknown styles, and existing-profile conflicts.
6. Choose a conflict decision for every row.
7. Apply the reviewed import.
8. Use the same central profile automatically in Quick Matches and planned-show matches.

## Safety rules

- Workbook macros are never executed.
- TEW database files remain read-only.
- Imports do not write ratings into TEW.
- Missing values are not invented.
- Default tracker values are labeled **Baseline placeholder** and do not count toward a complete profile.
- Existing manual overrides are preserved by default.
- Every import retains a pre-import snapshot for full-session rollback.

## Profile readiness

- **Ready** — all required approach and stamina fields have verified, imported, derived, or manually overridden values.
- **Usable with warnings** — enough verified information exists to use recommendations, but a small number of required or secondary fields still need attention.
- **Incomplete** — required skills remain missing or are still baseline placeholders.

Approach AI can run with incomplete profiles, but the companion identifies those recommendations as based on incomplete roster data.

## Import provenance

Every field records one of:

- Imported from workbook
- Imported from TEW
- Mapped from TEW
- Derived
- Manual override
- Missing
- Baseline placeholder

## Supported profile fields

The importer supports wrestler name, TEW worker ID, wrestler style, overall, health, popularity, experience, fan reaction, gimmick, and all 18 match-approach skills.

## Persistence

Backup version 16 adds profile-library records, field-level provenance, mapping presets, identity links, import sessions, conflict decisions, and rollback snapshots. Backups from versions 1 through 15 remain importable.
