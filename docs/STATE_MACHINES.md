# State Machines

All transitions are server-side allowlists. Every transition records actor and timestamp; privileged/exception transitions also write an audit event.

## Boarding request/booking

Canonical states:

- `PENDING_APPROVAL`
- `APPROVED_AWAITING_DEPOSIT`
- `CONFIRMED`
- `CHECKED_IN`
- `CHECKED_OUT`
- `REJECTED`
- `EXPIRED_PAYMENT`
- `CANCELLED_NO_REFUND`
- `NO_SHOW`

Allowed main paths:

| From | To | Conditions |
|---|---|---|
| PENDING_APPROVAL | APPROVED_AWAITING_DEPOSIT | LINE and approval |
| PENDING_APPROVAL | CONFIRMED | non-LINE approval or authorized waiver |
| PENDING_APPROVAL | REJECTED | authorized reviewer and reason |
| APPROVED_AWAITING_DEPOSIT | CONFIRMED | deposit verified |
| APPROVED_AWAITING_DEPOSIT | EXPIRED_PAYMENT | deadline passed, idempotent expiry |
| CONFIRMED | CHECKED_IN | room claimed and stay opened |
| CONFIRMED | NO_SHOW | authorized action and reason |
| CHECKED_IN | CHECKED_OUT | checkout transaction |
| active pre-check-in states | CANCELLED_NO_REFUND | authorized cancellation |

The room-card `เช็คอินทันที` shortcut executes the already-allowlisted `PENDING_APPROVAL → CONFIRMED → CHECKED_IN` transitions inside one server-authorized PostgreSQL transaction. It is not a new status and cannot leave a partially checked-in multi-room group.

Terminal states must not silently return to an active state. A correction requires an audited administrative recovery workflow designed explicitly, not an arbitrary status edit.

## Planned room allocation

- `HOLD`
- `RESERVED`
- `RELEASED`
- `CANCELLED`
- `EXPIRED`

`HOLD` and `RESERVED` consume planned capacity. Release reason and originating transition are recorded.

## Physical stay

- `OPEN`
- `CLOSED`

There is at most one `OPEN` stay per room. Planned dates do not close it. Explicit checkout changes `OPEN` to `CLOSED`.

## Room operational state

- `AVAILABLE`
- `CLEANING`
- `MAINTENANCE`
- `DISABLED`

Booking display overlays planned allocation and physical stay on operational state. An open stay has highest priority and displays occupied/red. Operational state changes do not delete booking history.

## Payment

- `NOT_REQUIRED`
- `WAITING`
- `SUBMITTED`
- `VERIFIED`
- `WAIVED`
- `EXPIRED`
- `FORFEITED`
- `REFUND_DUE`
- `REFUNDED`

Payment transitions require amount validation and an audit trail. Verification and refund require authorized roles.
For LINE, one payment state machine is owned by the booking group. Verification confirms every group unit currently awaiting that deposit; expiry expires and releases those waiting units atomically.

## Health review

- `NOT_REQUIRED`
- `PENDING`
- `APPROVED`
- `REJECTED`

Health rejection must include a reason and must not be inferred solely from a missing optional vaccination upload.

## Reschedule request

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

Approve in a transaction that locks both booking and relevant allocation resources.

## Sterilization

- `PENDING_CONFIRMATION`
- `CONFIRMED`
- `ARRIVED`
- `COMPLETED`
- `CANCELLED`
- `NO_SHOW`

Active daily capacity counts `PENDING_CONFIRMATION`, `CONFIRMED`, and `ARRIVED`. Completed remains historical but does not consume a future date. Cancelled/no-show do not count.

## Receipt

- `ISSUED`
- `VOID`

Issued receipts are immutable snapshots. Void requires actor and reason. Reissue creates a new receipt and a clear relationship to the voided receipt.
Only the final active room-unit checkout issues the combined booking-group receipt; earlier unit checkouts close their physical stays without creating a partial receipt.

## Temporary support grant

- `SCHEDULED`
- `ACTIVE`
- `EXPIRED`
- `REVOKED`

Effective access exists only when current time is within the approved interval, status is active, scope permits the action, and the tenant/user relationships remain valid.
