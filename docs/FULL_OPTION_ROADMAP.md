# HUG-PAENG Full Option Roadmap

Status: future product direction. This document records approved direction but does not authorize implementation of modules outside the current BMP Booking release.

## URL architecture

- `https://hug-paeng.com/` is the customer-facing website and public booking entry point. It must not render clinic administration navigation or disclose internal data.
- `https://hug-paeng.com/admin/login` is the canonical sign-in page for clinic `OWNER`, `DOCTOR`, and `STAFF` accounts.
- `https://hug-paeng.com/admin` is the canonical authenticated home of the back-office system. Do not add a redundant `/admin/home` route.
- The `/admin` home is a responsive, tenant-branded module launcher with full-screen artwork and top navigation. No clinic/business name is hard-coded into the SaaS shell. It does not use the booking module's sidebar; module routes restore their own operational navigation.
- All routes below `/admin/*` remain protected by server-side membership checks and PostgreSQL RLS. A hidden menu item is not authorization.

## Future back-office modules

The long-term product may combine these modules under the same authenticated shell:

1. Employee attendance and work-time management.
2. POS and counter sales.
3. Boarding booking, room operations, sterilization appointments, receipts, and refunds.
4. Business overview covering revenue, income, expenses, costs, profit/loss, and customer counts.
5. Operational and management reports with role-controlled Excel export.
6. A veterinarian workspace named `สำหรับสัตวแพทย์` for future blood-analyzer integration, referral documents, and approved clinical tools.
7. A capability-protected administration settings workspace for tenant identity, contacts, logo, payment, receipt, and future cross-module configuration. OWNER and ADMIN receive this capability by default.

These modules must share tenant identity, clinic membership, audit facts, and consistent customer/pet identity without copying authentication or financial facts between systems. Adding attendance, POS, accounting, payroll, or medical-record scope requires a separate approved phase, data model, security review, and acceptance criteria.

## Recommended Excel exports

Exports should require a date range, use Asia/Bangkok for display dates, preserve monetary values as decimal THB derived from integer satang, and include the tenant and export timestamp. Personally identifiable information must be limited to the user's role and stated business purpose.

### Current booking release

- **Boarding bookings:** booking group/code, channel, created date, customer, contact number, pet, species, room, planned check-in/out, nights, quoted nightly rate, booking status, deposit, and final amount.
- **Room utilization:** date, room code, species, available/held/occupied/cleaning/maintenance state, occupied nights, turnover, and utilization percentage.
- **Sterilization appointments:** appointment code/date/time, customer, contact number, pet, species, sex, breed, appointment status, overbook fact, cancellation, and holiday reason.
- **Receipts and payments:** receipt number/date/status, booking group, customer, line items, subtotal, one group deposit, amount collected/refunded, payment method, issuer, void/reissue linkage, and immutable snapshot identifiers.
- **Refunds:** refund date, original payment/receipt reference, amount, reason, verified incoming account identity, approver, and audit reference.

### Future Full Option modules

- **POS sales:** document number, product/service, category, quantity, unit price, discount, tax configuration, cost, gross profit, payment method, staff, and void/return linkage.
- **Income and expenses:** transaction date, account/category, document reference, counterparty, income, expense, payment channel, cost center, and approver.
- **Profit and loss:** period, revenue by service, cost of goods/services, operating expenses, gross profit, net profit, and comparisons with prior periods.
- **Customer and pet summary:** new/returning customer counts, visit frequency, services used, pet species/age bands, and consent-safe contact fields. Avoid exporting unnecessary health facts.
- **Attendance:** employee, work date, scheduled time, clock-in/out, late/early minutes, approved leave, overtime, and approver.
- **Audit and access:** privileged action, actor, role, entity, timestamp, result, tenant, and support-grant reference. Never export passwords, tokens, secrets, full bank credentials, or uploaded medical documents.

## Export safeguards

- Generate exports on the server from tenant-scoped queries; never trust a browser-supplied tenant identifier.
- Restrict finance, user, attendance, and audit exports by role and business need.
- Record who exported which report, tenant, date range, filters, timestamp, and row count.
- For large reports, use an expiring private Storage object and an audited one-time download rather than holding the request open.
- Use separate workbook sheets for summary, detail, filters/metadata, and data-quality exceptions when applicable.
