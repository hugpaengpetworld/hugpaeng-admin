# AGENTS.md

## Scope

- This is a temporary Google Sheets + Google Apps Script booking system.
- `src/` is the Apps Script backend and original HtmlService fallback.
- `cloudflare-web/` is the production web frontend for `bmpbooking.hug-paeng.com`.
- Preserve sheet names and header order because data access is schema-based.
- Keep public booking limited to overnight stays through WEBSITE or verified LINE.
- Keep DAYCARE and EMERGENCY_OWN_CAGE staff-only.

## Critical rules

- `PENDING_APPROVAL` consumes capacity immediately.
- Use `LockService` around every availability-check-and-create operation.
- LINE is the only channel requiring a 500 THB deposit.
- Never expose LINE tokens, password hashes, salts, session hashes, or private file URLs.
- Never expose `GAS_API_URL` or `GAS_GATEWAY_KEY` in browser assets; keep them as Cloudflare secrets.
- Keep Apps Script and Worker API actions in explicit matching allow-lists. Never dispatch arbitrary function names.
- Enforce permissions in server functions, not only in the UI.
- Thai dates are display-only; persistent dates use ISO `YYYY-MM-DD`.

## Verification

- Run `npm run build:cloudflare` whenever shared HTML or client code changes.
- Run `npm test`.
- Run `npm run check`.
- Test installation in a copy of the production spreadsheet before deployment.
- Do not rename tabs or reorder headers without a migration.
