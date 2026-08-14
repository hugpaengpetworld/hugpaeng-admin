import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface BookingResult {
  readonly bookings: readonly { readonly bookingId: string }[];
}

describeWithDatabase("Phase 5-6 check-in, checkout, and receipts", () => {
  const sql = postgres(databaseUrl!, { max: 6 });
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const staffId = randomUUID();
  const roomIds: string[] = [];
  const bookingIds: string[] = [];

  async function asUser<T>(
    userId: string,
    callback: (transaction: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    return (await sql.begin(async (transaction) => {
      await transaction`select set_config('request.jwt.claim.sub', ${userId}, true)`;
      await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;
      await transaction.unsafe("set local role authenticated");
      return callback(transaction);
    })) as T;
  }

  beforeAll(async () => {
    await sql`insert into auth.users (id, email) values
      (${ownerId}, ${`owner-${ownerId}@example.invalid`}),
      (${staffId}, ${`staff-${staffId}@example.invalid`})`;
    await sql`insert into public.tenants (id, slug, thai_name, english_name)
      values (${tenantId}, ${`phase56-${tenantId}`}, 'คลินิกทดสอบใบเสร็จ', 'Receipt Test Clinic')`;
    await sql`insert into public.tenant_settings
      (tenant_id, clinic_address, contact_phone)
      values (${tenantId}, '99 ถนนทดสอบ กรุงเทพมหานคร', '+66812345678')`;
    await sql`insert into public.profiles (user_id, display_name) values
      (${ownerId}, 'Receipt Owner'), (${staffId}, 'Receipt Staff')`;
    await sql`insert into public.tenant_memberships
      (tenant_id, user_id, role, status, activated_at) values
      (${tenantId}, ${ownerId}, 'OWNER', 'ACTIVE', now()),
      (${tenantId}, ${staffId}, 'STAFF', 'ACTIVE', now())`;
    const rooms = await sql<{ id: string }[]>`
      insert into public.room_inventory (tenant_id, room_code, species) values
      (${tenantId}, 'CAT01', 'CAT'), (${tenantId}, 'CAT02', 'CAT'),
      (${tenantId}, 'CAT03', 'CAT'), (${tenantId}, 'CAT04', 'CAT') returning id
    `;
    roomIds.push(...rooms.map(({ id }) => id));

    for (let index = 0; index < 2; index += 1) {
      const result = await asUser(
        ownerId,
        (transaction) => transaction<{ result: BookingResult }[]>`
          select public.create_back_office_booking(
            ${tenantId}, ${`เจ้าของ ${index + 1}`}, ${`081000000${index}`}, null,
            'PHONE', '2027-09-01', '2027-09-02', null,
            ${sql.json([{ species: "CAT", roomId: roomIds[index], pets: [{ name: `แมว ${index + 1}`, weightKg: null }] }])}::jsonb
          ) as result
        `,
      );
      const bookingId = result[0]!.result.bookings[0]!.bookingId;
      bookingIds.push(bookingId);
      const [booking] = await sql<{ version: number }[]>`
        select version from public.bookings where id = ${bookingId}
      `;
      await asUser(
        ownerId,
        (transaction) => transaction`
          select * from public.review_booking(${bookingId}, 'APPROVE', '', ${booking!.version})
        `,
      );
    }
  });

  afterAll(async () => {
    await sql`delete from public.audit_logs where tenant_id = ${tenantId}`;
    await sql`delete from public.tenants where id = ${tenantId}`;
    await sql`delete from auth.users where id in (${ownerId}, ${staffId})`;
    await sql.end();
  });

  it("allows only one concurrent physical stay in the same room", async () => {
    const firstBookingId = bookingIds[0];
    const secondBookingId = bookingIds[1];
    const targetRoomId = roomIds[0];
    if (!firstBookingId || !secondBookingId || !targetRoomId) {
      throw new Error("TEST_FIXTURE_MISSING");
    }
    const versions = await sql<{ id: string; version: number }[]>`
      select id, version from public.bookings where id in (${firstBookingId}, ${secondBookingId})
      order by id
    `;
    const versionById = new Map<string, number>(
      versions.map((row: { id: string; version: number }) => [
        row.id,
        row.version,
      ]),
    );
    const attempts = await Promise.allSettled(
      [firstBookingId, secondBookingId].map((bookingId) =>
        asUser(
          ownerId,
          (transaction) => transaction`
            select public.check_in_booking(
              ${bookingId}, ${targetRoomId}, ${100_000}, '',
              ${versionById.get(bookingId)!}, ${randomUUID()}
            )
          `,
        ),
      ),
    );
    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const [open] = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.room_stays
      where room_id = ${targetRoomId} and checked_out_at is null
    `;
    expect(open?.count).toBe(1);
  });

  it("requires early confirmation, then closes occupancy and snapshots a receipt", async () => {
    const [active] = await sql<
      { id: string; version: number; customer_id: string }[]
    >`
      select booking.id, booking.version, booking_group.customer_id
      from public.bookings booking
      join public.booking_groups booking_group on booking_group.id = booking.booking_group_id
      where booking.tenant_id = ${tenantId} and booking.status = 'CHECKED_IN'
    `;
    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.check_out_booking(
            ${active!.id}, '[]', ${sql.json({ method: "CASH" })}::jsonb,
            false, '', ${active!.version}, ${randomUUID()}
          )
        `,
      ),
    ).rejects.toThrow("EARLY_CHECKOUT_CONFIRMATION_REQUIRED");

    const checkout = await asUser(
      ownerId,
      (transaction) => transaction<{ result: { receiptId: string } }[]>`
        select public.check_out_booking(
          ${active!.id}, ${sql.json([{ category: "FOOD", amountSatang: 5_000, detail: "อาหารเปียก" }])}::jsonb,
          ${sql.json({ method: "CASH" })}::jsonb, true, 'กลับก่อนกำหนด',
          ${active!.version}, ${randomUUID()}
        ) as result
      `,
    );
    const receiptId = checkout[0]!.result.receiptId;
    const [facts] = await sql<
      {
        booking_status: string;
        room_status: string;
        open_stays: number;
        total_satang: number;
        item_total: number;
        refund_due_satang: number;
        customer_name: string;
        clinic_address: string;
        clinic_phone: string;
        tax_section_enabled: boolean;
        tax_id: string | null;
      }[]
    >`
      select booking.status as booking_status, room.operational_status as room_status,
        (select count(*)::integer from public.room_stays stay
          where stay.booking_id = booking.id and stay.checked_out_at is null) as open_stays,
        receipt.total_satang,
        (select sum(item.amount_satang)::integer from public.receipt_items item
          where item.receipt_id = receipt.id) as item_total,
        receipt.refund_due_satang, receipt.customer_name,
        receipt.clinic_address, receipt.clinic_phone,
        receipt.tax_section_enabled, receipt.tax_id
      from public.bookings booking
      join public.room_inventory room on room.id = booking.room_id
      join public.receipts receipt on receipt.booking_id = booking.id and receipt.status = 'ISSUED'
      where booking.id = ${active!.id}
    `;
    expect(facts).toMatchObject({
      booking_status: "CHECKED_OUT",
      room_status: "CLEANING",
      open_stays: 0,
      total_satang: 20_000,
      item_total: 20_000,
      refund_due_satang: 80_000,
      clinic_address: "99 ถนนทดสอบ กรุงเทพมหานคร",
      clinic_phone: "+66812345678",
      tax_section_enabled: false,
      tax_id: null,
    });

    await sql`update public.customers set full_name = 'ชื่อใหม่หลังออกใบเสร็จ'
      where id = ${active!.customer_id}`;
    await sql`update public.tenant_settings
      set clinic_address = 'ที่อยู่ใหม่หลังออกใบเสร็จ'
      where tenant_id = ${tenantId}`;
    const [snapshot] = await sql<
      { customer_name: string; clinic_address: string }[]
    >`
      select customer_name, clinic_address from public.receipts where id = ${receiptId}
    `;
    expect(snapshot!.customer_name).toBe(facts!.customer_name);
    expect(snapshot!.clinic_address).toBe("99 ถนนทดสอบ กรุงเทพมหานคร");
  });

  it("restricts refunds to OWNER and matches the original incoming account", async () => {
    const [deposit] = await sql<{ id: string }[]>`
      select payment.id from public.payments payment
      join public.receipts receipt
        on receipt.booking_group_id = payment.booking_group_id
       and receipt.status = 'ISSUED'
      where payment.tenant_id = ${tenantId}
        and payment.payment_type = 'DEPOSIT'
      order by receipt.issued_at limit 1
    `;
    await asUser(
      ownerId,
      (transaction) => transaction`
        select public.record_deposit_source_account(${deposit!.id}, 'สมหญิง ใจดี', '4321')
      `,
    );
    await expect(
      asUser(
        staffId,
        (transaction) => transaction`
          select public.record_refund(${deposit!.id}, 'สมหญิง ใจดี', '12344321', null)
        `,
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.record_refund(${deposit!.id}, 'ชื่อไม่ตรง', '12344321', null)
        `,
      ),
    ).rejects.toThrow("REFUND_ACCOUNT_MISMATCH");
    await asUser(
      ownerId,
      (transaction) => transaction`
        select public.record_refund(${deposit!.id}, 'สมหญิง ใจดี', '12344321', 'คืนผ่านธนาคาร')
      `,
    );
    const [booking] = await sql<{ payment_status: string }[]>`
      select booking.payment_status from public.bookings booking
      join public.payments payment
        on payment.booking_group_id = booking.booking_group_id
      where payment.id = ${deposit!.id}
      limit 1
    `;
    expect(booking?.payment_status).toBe("REFUNDED");
  });

  it("voids and reissues from the immutable snapshot with a new number", async () => {
    const [oldReceipt] = await sql<{ id: string; receipt_no: string }[]>`
      select id, receipt_no from public.receipts
      where tenant_id = ${tenantId} and status = 'ISSUED'
    `;
    const reissued = await asUser(
      ownerId,
      (transaction) => transaction<{ id: string }[]>`
        select public.reissue_receipt(${oldReceipt!.id}, 'แก้ไขเอกสาร') as id
      `,
    );
    const [newReceipt] = await sql<
      {
        receipt_no: string;
        reissued_from_receipt_id: string;
        total_satang: number;
      }[]
    >`
      select receipt_no, reissued_from_receipt_id, total_satang
      from public.receipts where id = ${reissued[0]!.id}
    `;
    expect(newReceipt!.receipt_no).not.toBe(oldReceipt!.receipt_no);
    expect(newReceipt!.reissued_from_receipt_id).toBe(oldReceipt!.id);
    expect(newReceipt!.total_satang).toBe(20_000);
  });

  it("issues one tax-enabled group receipt after the final room checkout and deducts deposit once", async () => {
    const groupRooms = [roomIds[2], roomIds[3]];
    if (!groupRooms[0] || !groupRooms[1])
      throw new Error("TEST_FIXTURE_MISSING");
    await sql`update public.tenant_settings set
      receipt_tax_enabled = true,
      receipt_tax_heading = 'ข้อมูลภาษีสำหรับใบเสร็จ',
      tax_id = '1234567890123',
      branch_number = 'สำนักงานใหญ่'
      where tenant_id = ${tenantId}`;
    const created = await asUser(
      ownerId,
      (transaction) => transaction<{ result: BookingResult }[]>`
        select public.create_back_office_booking(
          ${tenantId}, 'เจ้าของกลุ่มสองห้อง', '0899999999', null,
          'PHONE', '2027-10-01', '2027-10-02', null,
          ${sql.json([
            {
              species: "CAT",
              roomId: groupRooms[0],
              pets: [{ name: "ส้ม", weightKg: null }],
            },
            {
              species: "CAT",
              roomId: groupRooms[1],
              pets: [{ name: "ขาว", weightKg: null }],
            },
          ])}::jsonb
        ) as result
      `,
    );
    const groupBookingIds = created[0]!.result.bookings.map(
      ({ bookingId }) => bookingId,
    );
    for (let index = 0; index < groupBookingIds.length; index += 1) {
      const bookingId = groupBookingIds[index]!;
      const [pending] = await sql<{ version: number }[]>`
        select version from public.bookings where id = ${bookingId}
      `;
      await asUser(
        ownerId,
        (transaction) => transaction`
          select * from public.review_booking(
            ${bookingId}, 'APPROVE', '', ${pending!.version}
          )
        `,
      );
      const [confirmed] = await sql<{ version: number }[]>`
        select version from public.bookings where id = ${bookingId}
      `;
      await asUser(
        ownerId,
        (transaction) => transaction`
          select public.check_in_booking(
            ${bookingId}, ${groupRooms[index]!}, ${50_000}, '',
            ${confirmed!.version}, ${randomUUID()}
          )
        `,
      );
    }

    const [firstActive] = await sql<{ version: number }[]>`
      select version from public.bookings where id = ${groupBookingIds[0]!}
    `;
    const firstCheckout = await asUser(
      ownerId,
      (transaction) => transaction<
        { result: { receiptId: string | null; finalGroupCheckout: boolean } }[]
      >`
        select public.check_out_booking(
          ${groupBookingIds[0]!},
          ${sql.json([{ category: "FOOD", amountSatang: 5_000, detail: "อาหารห้องแรก" }])}::jsonb,
          ${sql.json({ method: "NOT_SPECIFIED" })}::jsonb,
          true, '', ${firstActive!.version}, ${randomUUID()}
        ) as result
      `,
    );
    expect(firstCheckout[0]!.result).toMatchObject({
      receiptId: null,
      finalGroupCheckout: false,
    });

    const [secondActive] = await sql<{ version: number }[]>`
      select version from public.bookings where id = ${groupBookingIds[1]!}
    `;
    const finalCheckout = await asUser(
      ownerId,
      (transaction) => transaction<
        { result: { receiptId: string; finalGroupCheckout: boolean } }[]
      >`
        select public.check_out_booking(
          ${groupBookingIds[1]!},
          ${sql.json([{ category: "CAT_FELV_VACCINE", amountSatang: 10_000, detail: "วัคซีนป้องกันโรคลิวคีเมียแมว (FeLV)" }])}::jsonb,
          ${sql.json({ method: "CASH" })}::jsonb,
          true, 'ใบเสร็จรวมสองห้อง', ${secondActive!.version}, ${randomUUID()}
        ) as result
      `,
    );
    expect(finalCheckout[0]!.result.finalGroupCheckout).toBe(true);
    const receiptId = finalCheckout[0]!.result.receiptId;
    const [groupReceipt] = await sql<
      {
        receipt_count: number;
        total_satang: number;
        deposit_satang: number;
        refund_due_satang: number;
        lodging_lines: number;
        tax_section_enabled: boolean;
        tax_heading: string;
        tax_id: string;
        branch_number: string;
        felv_lines: number;
      }[]
    >`
      select
        (select count(*)::integer from public.receipts scoped
          where scoped.booking_group_id = receipt.booking_group_id
            and scoped.status = 'ISSUED') as receipt_count,
        receipt.total_satang, receipt.deposit_satang, receipt.refund_due_satang,
        (select count(*)::integer from public.receipt_items item
          where item.receipt_id = receipt.id and item.item_type = 'LODGING') as lodging_lines,
        (select count(*)::integer from public.receipt_items item
          where item.receipt_id = receipt.id
            and item.item_name = 'วัคซีนป้องกันโรคลิวคีเมียแมว (FeLV)') as felv_lines,
        receipt.tax_section_enabled, receipt.tax_heading, receipt.tax_id,
        receipt.branch_number
      from public.receipts receipt where receipt.id = ${receiptId}
    `;
    expect(groupReceipt).toMatchObject({
      receipt_count: 1,
      total_satang: 45_000,
      deposit_satang: 50_000,
      refund_due_satang: 5_000,
      lodging_lines: 2,
      felv_lines: 1,
      tax_section_enabled: true,
      tax_heading: "ข้อมูลภาษีสำหรับใบเสร็จ",
      tax_id: "1234567890123",
      branch_number: "สำนักงานใหญ่",
    });

    await sql`update public.tenant_settings set
      receipt_tax_enabled = false, receipt_tax_heading = null,
      tax_id = null, branch_number = null
      where tenant_id = ${tenantId}`;
    const [snapshot] = await sql<
      { tax_section_enabled: boolean; tax_id: string }[]
    >`
      select tax_section_enabled, tax_id from public.receipts
      where id = ${receiptId}
    `;
    expect(snapshot).toMatchObject({
      tax_section_enabled: true,
      tax_id: "1234567890123",
    });
  });

  it("requires a matching Dynamic PromptPay quote and funds-received confirmation", async () => {
    const [room] = await sql<{ id: string }[]>`
      insert into public.room_inventory (tenant_id, room_code, species)
      values (${tenantId}, 'CAT05', 'CAT') returning id
    `;
    const created = await asUser(
      ownerId,
      (transaction) => transaction<{ result: BookingResult }[]>`
        select public.create_back_office_booking(
          ${tenantId}, 'เจ้าของพร้อมเพย์', '0812223333', null,
          'PHONE', '2027-11-01', '2027-11-02', null,
          ${sql.json([{ species: "CAT", roomId: room!.id, pets: [{ name: "คิวอาร์", weightKg: null }] }])}::jsonb
        ) as result
      `,
    );
    const bookingId = created[0]!.result.bookings[0]!.bookingId;
    const [pending] = await sql<{ version: number }[]>`
      select version from public.bookings where id = ${bookingId}
    `;
    await asUser(
      ownerId,
      (transaction) => transaction`
        select * from public.review_booking(${bookingId}, 'APPROVE', '', ${pending!.version})
      `,
    );
    const [confirmed] = await sql<{ version: number }[]>`
      select version from public.bookings where id = ${bookingId}
    `;
    await asUser(
      ownerId,
      (transaction) => transaction`
        select public.check_in_booking(
          ${bookingId}, ${room!.id}, 0, '', ${confirmed!.version}, ${randomUUID()}
        )
      `,
    );
    const [active] = await sql<{ version: number }[]>`
      select version from public.bookings where id = ${bookingId}
    `;

    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.check_out_booking(
            ${bookingId}, '[]',
            ${sql.json({ method: "PROMPTPAY", quotedAmountSatang: 15_000, receivedConfirmed: false })}::jsonb,
            true, '', ${active!.version}, ${randomUUID()}
          )
        `,
      ),
    ).rejects.toThrow("PROMPTPAY_PAYMENT_CONFIRMATION_REQUIRED");

    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.check_out_booking(
            ${bookingId}, '[]',
            ${sql.json({ method: "PROMPTPAY", quotedAmountSatang: 14_999, receivedConfirmed: true })}::jsonb,
            true, '', ${active!.version}, ${randomUUID()}
          )
        `,
      ),
    ).rejects.toThrow("PROMPTPAY_PAYMENT_CONFIRMATION_REQUIRED");

    await asUser(
      ownerId,
      (transaction) => transaction`
        select public.check_out_booking(
          ${bookingId}, '[]',
          ${sql.json({ method: "PROMPTPAY", quotedAmountSatang: 15_000, receivedConfirmed: true })}::jsonb,
          true, '', ${active!.version}, ${randomUUID()}
        )
      `,
    );
    const [payment] = await sql<
      { amount_satang: number; payment_method: string; status: string }[]
    >`
      select amount_satang, payment_method, status from public.payments
      where booking_group_id = (
        select booking_group_id from public.bookings where id = ${bookingId}
      ) and payment_type = 'CHECKOUT'
    `;
    expect(payment).toMatchObject({
      amount_satang: 15_000,
      payment_method: "PROMPTPAY",
      status: "VERIFIED",
    });
  });
});
