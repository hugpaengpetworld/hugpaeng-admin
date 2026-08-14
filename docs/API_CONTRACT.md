# API and Service Contract

This is a behavioral contract, not a requirement to expose a public REST API. Implement with typed server actions/routes and database RPCs where appropriate.

## General rules

- Validate with a shared schema library at every trust boundary.
- Return stable error codes plus safe Thai messages.
- Mutations accept an idempotency key where retry is plausible.
- Derive tenant and actor from authenticated context, not arbitrary request fields.
- Dates in JSON use ISO `YYYY-MM-DD`; timestamps use ISO 8601 UTC.
- Never expose service-role credentials or raw database errors.

## Public operations

- `searchBoardingAvailability`
  - input: tenant slug, service type, species, pet count/weights, check-in/out dates;
  - output: available count and pricing preview;
  - does not expose exact room IDs.
- `createBoardingRequest`
  - validates rules, rate limit, and atomically creates group/unit holds;
  - returns public request code and safe next steps.
- `getPublicBookingStatus`
  - verifies booking code plus phone or approved LINE identity;
  - returns a restricted status projection.
- `requestReschedule`
  - verifies code/phone, limit, notice, and capacity;
  - never changes allocation until approval transaction.

## Admin boarding operations

- `listBookings(filters, cursor)`
- `getBookingDetail(bookingId)`
- `createBackOfficeBooking(payload)`
- `reviewBooking(bookingId, decision, version)`
- `assignRoom(bookingId, roomId, version)`
- `listEligibleRooms(bookingId)`
- `checkInBooking(bookingId, roomId, deposit, notes, idempotencyKey)`
  - `deposit` คือยอดรวมมัดจำที่ถือไว้ ณ เช็กอิน ไม่ใช่ยอดเพิ่ม; ต้องไม่น้อยกว่ายอดที่ตรวจรับแล้ว
- `previewCheckout(bookingId)`
- `checkOutBooking(bookingId, charges, payment, confirmation, idempotencyKey)`
  - database คำนวณยอดรับเพิ่ม/ยอดรอคืนจาก immutable quoted lodging + charge facts - deposit
  - ปิด stay, ปล่อย allocation, เปลี่ยนห้องเป็น cleaning และออก receipt snapshot ใน transaction เดียว
- `changeRoomOperationalState(roomId, state, reason, version)`

Use optimistic version checks for normal edits and database row locks for capacity/status mutations.

## Operational lists

- `listWaitingCheckIns` returns all eligible waiting rows unless explicit filters are supplied.
- `listActiveAndCheckoutDue` returns all open stays, with due/overdue facts derived separately.
- Both return booking code, owner, pets with species labels, room, check-in, checkout, and permitted actions.

## Sterilization operations

- `getSterilizationMonth(month)`
- `createSterilizationAppointment(payload, acknowledgeOverbook?)`
- `updateSterilizationAppointment(id, transition/payload)`
- `getSterilizationAppointment(id)`
- `manageSterilizationHoliday(payload)`

Overbook acknowledgement is required only when normal capacity would be exceeded and is audited.

## Finance and receipts

- `verifyDeposit(paymentId, evidence)`
- `recordRefund(paymentId, matchingAccountEvidence)`
  - ต้องมี `REFUNDS_MANAGE`; ชื่อบัญชี normalized และเลขท้าย 4 หลักต้องตรงกับหลักฐานเงินมัดจำเดิม
- `getReceipt(receiptId)`
- `reprintReceipt(receiptId)`
- `voidReceipt(receiptId, reason)`
- `reissueReceipt(receiptId, reason)`
  - ต้องมี `RECEIPTS_MANAGE`; void ใบเดิมและคัดลอก immutable snapshot ไปเลขใหม่ใน transaction เดียว
- `regenerateReceiptArtifact(receiptId)`

Receipt queries return immutable snapshots, not current mutable customer/booking fields.

## Error codes

At minimum:

- `VALIDATION_ERROR`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `TENANT_MISMATCH`
- `NOT_FOUND`
- `VERSION_CONFLICT`
- `ROOM_UNAVAILABLE`
- `ROOM_SPECIES_MISMATCH`
- `ROOM_NOT_READY`
- `OPEN_STAY_EXISTS`
- `INVALID_STATUS_TRANSITION`
- `PAYMENT_DEADLINE_EXPIRED`
- `RESCHEDULE_LIMIT_REACHED`
- `RESCHEDULE_NOTICE_TOO_SHORT`
- `CAPACITY_EXCEEDED`
- `IDEMPOTENCY_CONFLICT`
- `DEPOSIT_BELOW_VERIFIED`
- `EARLY_CHECKOUT_CONFIRMATION_REQUIRED`
- `INVALID_CHARGE`
- `ORIGINAL_ACCOUNT_EVIDENCE_REQUIRED`
- `REFUND_ACCOUNT_MISMATCH`
- `INTEGRATION_TEMPORARILY_UNAVAILABLE`

Errors must include a request/correlation ID for support without leaking internal details.
