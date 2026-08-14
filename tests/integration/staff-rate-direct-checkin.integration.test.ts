import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface BookingResult {
  readonly bookingGroupId: string;
  readonly bookings: readonly { readonly bookingId: string }[];
  readonly idempotencyReplay?: boolean;
  readonly status: string;
}

describeWithDatabase("custom staff rates and direct check-in", () => {
  const sql = postgres(databaseUrl!, { max: 8 });
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const staffId = randomUUID();
  const rooms: Record<string, string> = {};
  let bangkokToday = "";
  let bangkokTomorrow = "";

  beforeAll(async () => {
    const [dates] = await sql<{ today: string; tomorrow: string }[]>`
      select
        (now() at time zone 'Asia/Bangkok')::date::text as today,
        ((now() at time zone 'Asia/Bangkok')::date + 1)::text as tomorrow
    `;
    bangkokToday = dates!.today;
    bangkokTomorrow = dates!.tomorrow;

    await sql`
      insert into auth.users (id, email)
      values
        (${ownerId}, ${`rate-owner-${ownerId}@example.invalid`}),
        (${staffId}, ${`rate-staff-${staffId}@example.invalid`})
    `;
    await sql`
      insert into public.tenants (id, slug, thai_name, english_name)
      values (
        ${tenantId}, ${`staff-rate-${tenantId}`},
        'คลินิกทดสอบราคาพนักงาน', 'Staff Rate Test Clinic'
      )
    `;
    await sql`
      insert into public.profiles (user_id, display_name)
      values (${ownerId}, 'Rate Owner'), (${staffId}, 'Rate Staff')
    `;
    await sql`
      insert into public.tenant_memberships (
        tenant_id, user_id, role, status, activated_at
      ) values
        (${tenantId}, ${ownerId}, 'OWNER', 'ACTIVE', now()),
        (${tenantId}, ${staffId}, 'STAFF', 'ACTIVE', now())
    `;
    const createdRooms = await sql<{ id: string; room_code: string }[]>`
      insert into public.room_inventory (tenant_id, room_code, species)
      values
        (${tenantId}, 'CAT01', 'CAT'),
        (${tenantId}, 'CAT02', 'CAT'),
        (${tenantId}, 'CAT03', 'CAT'),
        (${tenantId}, 'CAT04', 'CAT'),
        (${tenantId}, 'CAT05', 'CAT'),
        (${tenantId}, 'CAT06', 'CAT'),
        (${tenantId}, 'DOG01', 'DOG')
      returning id, room_code
    `;
    for (const room of createdRooms) rooms[room.room_code] = room.id;
  });

  afterAll(async () => {
    await sql`delete from public.audit_logs where tenant_id = ${tenantId}`;
    await sql`delete from public.tenants where id = ${tenantId}`;
    await sql`delete from auth.users where id in (${ownerId}, ${staffId})`;
    await sql.end();
  });

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

  it("stores an audited custom nightly rate and calculated total", async () => {
    const checkIn = "2027-06-01";
    const checkOut = "2027-06-04";
    const [created] = await asUser(
      staffId,
      (transaction) => transaction<{ result: BookingResult }[]>`
        select public.create_priced_back_office_booking(
          ${tenantId}, 'ลูกค้าประจำ', '0811111111', null, 'PHONE',
          ${checkIn}, ${checkOut}, null,
          ${sql.json([
            {
              species: "CAT",
              roomId: rooms.CAT01,
              nightlyRateSatang: 12_000,
              pets: [{ name: "ชาไทย", weightKg: null }],
            },
          ])}::jsonb
        ) as result
      `,
    );
    const bookingId = created!.result.bookings[0]!.bookingId;
    const [facts] = await sql<
      {
        nightly_rate_satang: number;
        lodging_total_satang: number;
        audit_count: number;
      }[]
    >`
      select booking.nightly_rate_satang, booking.lodging_total_satang,
        (select count(*)::integer from public.audit_logs audit
          where audit.entity_id = booking.id
            and audit.action = 'BOOKING_NIGHTLY_RATE_QUOTED') as audit_count
      from public.bookings booking where booking.id = ${bookingId}
    `;
    expect(facts).toMatchObject({
      nightly_rate_satang: 12_000,
      lodging_total_satang: 36_000,
      audit_count: 1,
    });
  });

  it("lets staff create and check in today atomically and replays safely", async () => {
    const key = randomUUID();
    const units = [
      {
        species: "CAT",
        roomId: rooms.CAT02,
        nightlyRateSatang: 13_000,
        pets: [{ name: "โกโก้", weightKg: null }],
      },
    ];
    const request = () =>
      asUser(
        staffId,
        (transaction) => transaction<{ result: BookingResult }[]>`
          select public.create_and_check_in_back_office_booking(
            ${tenantId}, 'ลูกค้าเช็คอินทันที', '0822222222', null, 'WALK_IN',
            ${bangkokToday}, ${bangkokTomorrow}, null,
            ${sql.json(units)}::jsonb, 0, ${key}
          ) as result
        `,
      );

    const [first] = await request();
    const [replay] = await request();
    expect(first!.result.status).toBe("CHECKED_IN");
    expect(replay!.result.idempotencyReplay).toBe(true);

    const [facts] = await sql<
      { booking_count: number; stay_count: number; status: string }[]
    >`
      select
        count(distinct booking.id)::integer as booking_count,
        count(stay.id)::integer as stay_count,
        max(booking.status::text) as status
      from public.booking_groups booking_group
      join public.bookings booking on booking.booking_group_id = booking_group.id
      left join public.room_stays stay on stay.booking_id = booking.id
      join public.customers customer on customer.id = booking_group.customer_id
      where booking_group.tenant_id = ${tenantId}
        and customer.phone = '0822222222'
    `;
    expect(facts).toMatchObject({
      booking_count: 1,
      stay_count: 1,
      status: "CHECKED_IN",
    });
  });

  it("uses one 500 THB LINE deposit across a multi-room direct check-in", async () => {
    const [created] = await asUser(
      ownerId,
      (transaction) => transaction<{ result: BookingResult }[]>`
        select public.create_and_check_in_back_office_booking(
          ${tenantId}, 'ลูกค้าไลน์', '0833333333', 'Ustaffratedirect', 'LINE',
          ${bangkokToday}, ${bangkokTomorrow}, null,
          ${sql.json([
            {
              species: "CAT",
              roomId: rooms.CAT03,
              nightlyRateSatang: 15_000,
              pets: [{ name: "มะลิ", weightKg: null }],
            },
            {
              species: "DOG",
              roomId: rooms.DOG01,
              nightlyRateSatang: 18_000,
              pets: [{ name: "ด่าง", weightKg: 12 }],
            },
          ])}::jsonb,
          50_000, ${randomUUID()}
        ) as result
      `,
    );
    const groupId = created!.result.bookingGroupId;
    const [facts] = await sql<
      {
        stays: number;
        deposit_rows: number;
        payment_amount: number;
        stay_deposit_total: number;
      }[]
    >`
      select
        count(stay.id)::integer as stays,
        (select count(*)::integer from public.payments payment
          where payment.booking_group_id = ${groupId}
            and payment.payment_type = 'DEPOSIT') as deposit_rows,
        (select amount_satang from public.payments payment
          where payment.booking_group_id = ${groupId}
            and payment.payment_type = 'DEPOSIT') as payment_amount,
        sum(stay.deposit_satang)::integer as stay_deposit_total
      from public.bookings booking
      join public.room_stays stay on stay.booking_id = booking.id
      where booking.booking_group_id = ${groupId}
    `;
    expect(facts).toMatchObject({
      stays: 2,
      deposit_rows: 1,
      payment_amount: 50_000,
      stay_deposit_total: 50_000,
    });
  });

  it("rolls back the whole direct group when one room conflicts", async () => {
    await expect(
      asUser(
        staffId,
        (transaction) => transaction`
          select public.create_and_check_in_back_office_booking(
            ${tenantId}, 'ลูกค้าห้องซ้ำ', '0866666666', null, 'PHONE',
            ${bangkokToday}, ${bangkokTomorrow}, null,
            ${sql.json([
              {
                species: "CAT",
                roomId: rooms.CAT04,
                nightlyRateSatang: 14_000,
                pets: [{ name: "หนึ่ง", weightKg: null }],
              },
              {
                species: "CAT",
                roomId: rooms.CAT04,
                nightlyRateSatang: 14_000,
                pets: [{ name: "สอง", weightKg: null }],
              },
            ])}::jsonb,
            0, ${randomUUID()}
          )
        `,
      ),
    ).rejects.toThrow("ROOM_UNAVAILABLE");

    const [facts] = await sql<{ groups: number; stays: number }[]>`
      select
        count(distinct booking_group.id)::integer as groups,
        count(stay.id)::integer as stays
      from public.customers customer
      left join public.booking_groups booking_group
        on booking_group.customer_id = customer.id
      left join public.bookings booking
        on booking.booking_group_id = booking_group.id
      left join public.room_stays stay on stay.booking_id = booking.id
      where customer.tenant_id = ${tenantId}
        and customer.phone = '0866666666'
    `;
    expect(facts).toMatchObject({ groups: 0, stays: 0 });
  });

  it("rejects a short LINE deposit without creating a booking", async () => {
    const baseUnits = [
      {
        species: "CAT",
        roomId: rooms.CAT04,
        nightlyRateSatang: 15_000,
        pets: [{ name: "ข้าวปั้น", weightKg: null }],
      },
    ];
    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.create_and_check_in_back_office_booking(
            ${tenantId}, 'มัดจำไม่ครบ', '0844444444', 'Ushortdeposit', 'LINE',
            ${bangkokToday}, ${bangkokTomorrow}, null,
            ${sql.json(baseUnits)}::jsonb, 49_900, ${randomUUID()}
          )
        `,
      ),
    ).rejects.toThrow("LINE_DEPOSIT_REQUIRED");

    const [bookingCount] = await sql<{ count: number }[]>`
      select count(*)::integer as count
      from public.booking_groups booking_group
      join public.customers customer on customer.id = booking_group.customer_id
      where booking_group.tenant_id = ${tenantId}
        and customer.phone = '0844444444'
    `;
    expect(bookingCount?.count).toBe(0);
  });

  it("approves and checks in a held room-card booking atomically", async () => {
    const [created] = await asUser(
      staffId,
      (transaction) => transaction<{ result: BookingResult }[]>`
        select public.create_priced_back_office_booking(
          ${tenantId}, 'ลูกค้ารออนุมัติ', '0855555555', null, 'PHONE',
          ${bangkokToday}, ${bangkokTomorrow}, null,
          ${sql.json([
            {
              species: "CAT",
              roomId: rooms.CAT05,
              nightlyRateSatang: 15_000,
              pets: [{ name: "ถุงเงิน", weightKg: null }],
            },
          ])}::jsonb
        ) as result
      `,
    );
    const bookingId = created!.result.bookings[0]!.bookingId;
    const [booking] = await sql<{ version: number; status: string }[]>`
      select version, status::text as status
      from public.bookings where id = ${bookingId}
    `;
    expect(booking?.status).toBe("PENDING_APPROVAL");

    const key = randomUUID();
    const request = () =>
      asUser(
        staffId,
        async (transaction) =>
          await transaction<{ result: BookingResult }[]>`
            select public.check_in_room_booking(
              ${bookingId}, ${rooms.CAT05!}, 0,
              'เช็คอินจากการ์ดห้อง', ${booking!.version}, ${key}
            ) as result
          `,
      );
    const [first] = await request();
    const [replay] = await request();
    expect(first!.result.status).toBe("CHECKED_IN");
    expect(replay!.result.idempotencyReplay).toBe(true);
    await expect(
      asUser(
        staffId,
        (transaction) => transaction`
          select public.check_in_room_booking(
            ${bookingId}, ${rooms.CAT05!}, 0,
            'different payload', ${booking!.version}, ${key}
          )
        `,
      ),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");

    const [facts] = await sql<
      {
        status: string;
        stay_count: number;
        approval_audit_count: number;
      }[]
    >`
      select booking.status::text as status,
        (select count(*)::integer from public.room_stays stay
          where stay.booking_id = booking.id) as stay_count,
        (select count(*)::integer from public.audit_logs audit
          where audit.entity_id = booking.id
            and audit.action = 'BOOKING_APPROVED_FOR_ROOM_CHECK_IN')
          as approval_audit_count
      from public.bookings booking where booking.id = ${bookingId}
    `;
    expect(facts).toMatchObject({
      status: "CHECKED_IN",
      stay_count: 1,
      approval_audit_count: 1,
    });
  });

  it("requires the one 500 THB group deposit for LINE room-card check-in", async () => {
    const [created] = await asUser(
      ownerId,
      (transaction) => transaction<{ result: BookingResult }[]>`
        select public.create_priced_back_office_booking(
          ${tenantId}, 'ลูกค้าไลน์รออนุมัติ', '0888888888',
          'Uroomcardline', 'LINE', ${bangkokToday}, ${bangkokTomorrow}, null,
          ${sql.json([
            {
              species: "CAT",
              roomId: rooms.CAT06,
              nightlyRateSatang: 15_000,
              pets: [{ name: "ชาไทย", weightKg: null }],
            },
          ])}::jsonb
        ) as result
      `,
    );
    const bookingId = created!.result.bookings[0]!.bookingId;
    const [booking] = await sql<{ version: number }[]>`
      select version from public.bookings where id = ${bookingId}
    `;

    await expect(
      asUser(
        ownerId,
        async (transaction) =>
          await transaction`
            select public.check_in_room_booking(
              ${bookingId}, ${rooms.CAT06!}, 49_900, null,
              ${booking!.version}, ${randomUUID()}
            )
          `,
      ),
    ).rejects.toThrow("LINE_DEPOSIT_REQUIRED");

    await asUser(
      ownerId,
      async (transaction) =>
        await transaction`
          select public.check_in_room_booking(
            ${bookingId}, ${rooms.CAT06!}, 50_000, null,
            ${booking!.version}, ${randomUUID()}
          )
        `,
    );
    const [facts] = await sql<
      { status: string; deposit_rows: number; deposit_amount: number }[]
    >`
      select booking.status::text as status,
        (select count(*)::integer from public.payments payment
          where payment.booking_group_id = booking.booking_group_id
            and payment.payment_type = 'DEPOSIT') as deposit_rows,
        (select amount_satang from public.payments payment
          where payment.booking_group_id = booking.booking_group_id
            and payment.payment_type = 'DEPOSIT') as deposit_amount
      from public.bookings booking where booking.id = ${bookingId}
    `;
    expect(facts).toMatchObject({
      status: "CHECKED_IN",
      deposit_rows: 1,
      deposit_amount: 50_000,
    });
  });
});
