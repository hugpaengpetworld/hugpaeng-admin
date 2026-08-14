# Business Rules

## Canonical constants

| Rule | Value |
|---|---|
| Clinic timezone | Asia/Bangkok |
| Display date | DD-MM-YYYY (Gregorian) |
| Cat rooms | CAT01–CAT11 initially; OWNER may add sequential CATxx rooms |
| Dog rooms | DOG01–DOG07 initially; OWNER may add sequential DOGxx rooms |
| Max animals per room | 2 |
| LINE deposit | 500 THB per booking group |
| LINE payment window | 1 hour after approval |
| Reschedules | 1 |
| Reschedule notice | at least 3 days |
| Sterilization normal daily capacity | 4 |

## Pricing

### Overnight

- One cat: 150 THB per night.
- Two compatible cats in one room: 200 THB per night.
- One dog: 150 THB per night and maximum 20 kg.
- Two compatible dogs: 200 THB per night; each dog must be no more than 8 kg.
- These are the public/default rates. An authenticated clinic user creating a back-office booking may enter a positive custom nightly rate per room unit. The quote is stored in integer satang, multiplied by the validated night count, and audited with the standard rate for that animal count.
- Reject zero nights, checkout before check-in, more than two animals, invalid dog weight, or a missing required dog weight.

### Day care

- Billable hours are rounded down when remainder is 30 minutes or less and up when remainder is more than 30 minutes.
- Up to three billable hours: 50 THB per hour.
- More than three hours: 150 THB flat.
- Owner-cage emergency service has no lodging charge when accepted, except dog over 8 kg must use a clinic room.

## Capacity and room assignment

- `PENDING_APPROVAL`, approved deposit-waiting, and confirmed room holds consume planned capacity.
- Rejected, expired, cancelled, no-show, and completed allocations do not consume future planned capacity after release.
- A checked-in physical stay consumes the room until explicit checkout, even after planned checkout time/date.
- The system must not infer checkout from the clock.
- Room species and booking species must match.
- A room in cleaning, maintenance, or disabled state cannot receive a new physical check-in.
- Only an active tenant user with `ROOM_INVENTORY_MANAGE` may remove a room from active inventory. The operation is a soft retirement with a required reason and audit fact; room codes are never reused and historical bookings/stays continue to reference the retired room.
- A room with an open physical stay or any active `HOLD`/`RESERVED` allocation cannot be retired. Staff must complete checkout or cancel/release the booking first.
- Availability check and allocation creation must be one transaction.
- Direct check-in from an available room card creates, confirms, allocates, and opens all requested room stays in one transaction. A conflict in any room rolls back the complete booking group.

## Payment and deposit

- LINE-originated bookings require one 500 THB deposit per booking group after approval. Adding room units to the same group must not multiply the required deposit.
- Other channels default to not required but may record a manual deposit.
- Direct LINE check-in must record at least one 500 THB deposit for the booking group; multi-room direct check-in must not duplicate it per room.
- Only verified payment confirms a required deposit.
- Expiry is idempotent: repeated jobs cannot release twice or send duplicate notifications.
- A cancellation deposit is forfeited.
- A refund due at checkout is the positive remaining deposit after all charges. Refund workflow remains separately auditable.
- Dynamic PromptPay QR uses Thai QR Payment Tag 29 and embeds the exact positive final amount due in integer satang. It is generated anew for each quote.
- PromptPay checkout requires an explicit funds-received confirmation and a quoted amount matching the amount recalculated inside the checkout transaction. A QR image alone is not payment evidence.
- Do not show a collection QR for a non-final room checkout, a zero balance, a refund-due balance, or an already-issued paid receipt.

## Receipt identity

- Receipt headers show the clinic address and telephone number by default.
- Tax-information heading, tax identification number, and branch number remain hidden unless an OWNER explicitly enables and configures them in clinic settings.
- Clinic identity is copied into the immutable receipt snapshot at issue time.

## Group settlement

- One booking group produces one combined receipt after all active room units in the group have checked out.
- Lodging and additional charges from every completed unit in the group are included as separate immutable receipt lines.
- The booking-group deposit is subtracted once from the combined total. It must not be copied or subtracted once per room.
- A room may check out before another room in the same group; its room moves to cleaning immediately, while final payment and receipt issuance wait for the last active unit.

## Health

- Vaccination attachment is optional.
- Flea/tick answers may require staff review but do not silently reject the request.
- Uploaded files require allowlisted MIME types, size limits, randomized object paths, and tenant-scoped access.

## Rescheduling

- At most one approved reschedule.
- Public request verifies booking code and phone.
- New capacity is secured before old capacity is released in one transaction.
- If new capacity cannot be secured, leave the original booking unchanged.
- Cancellation does not convert into a free reschedule.

## Check-in

- Authorized users may check in at any time.
- Booking must be eligible, room must match species, and room must have no open physical stay.
- Record actor, timestamp, optional deposit, and check-in notes.
- Opening a stay and updating the booking state must be atomic.

## Checkout

- Authorized users may check out at any time.
- Early checkout requires confirmation in the UI and validation again on the server.
- Close the open physical stay, calculate totals, create financial snapshot facts, transition booking, and set room to cleaning transactionally.
- Receipt rendering/upload failure happens after transactional checkout and is recoverable.

## Booking and receipt numbering

- Booking unit: `BMP-YYYYMMDD-{ROOM_ID}-{NN}`.
- Receipt: `BMP-RCP-YYYYMMDD-{NNNN}`.
- Sequences are atomic and never reused.
- Human codes are not primary keys.

## Sterilization

- Public users cannot create sterilization appointments.
- Four active appointments is full and renders red.
- More than four renders purple.
- Overbooking requires an authorized user, explicit acknowledgement, and audit.
- Cancelled/no-show appointments do not count toward active capacity according to the status rules in `STATE_MACHINES.md`.
