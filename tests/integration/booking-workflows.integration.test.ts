import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface CreatedBookingResult {
  readonly bookingGroupId: string;
  readonly bookings: readonly {
    readonly bookingId: string;
    readonly bookingCode: string;
  }[];
}

describeWithDatabase("Phase 3-4 booking workflows", () => {
  const sql = postgres(databaseUrl!, { max: 8 });
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const tenantSlug = `workflow-${tenantId}`;
  const roomIds: Record<string, string> = {};

  beforeAll(async () => {
    await sql`insert into auth.users (id, email) values (${ownerId}, ${`owner-${ownerId}@example.invalid`})`;
    await sql`
      insert into public.tenants (id, slug, thai_name, english_name)
      values (${tenantId}, ${tenantSlug}, 'คลินิกทดสอบ workflow', 'Workflow Clinic')
    `;
    await sql`
      insert into public.profiles (user_id, display_name)
      values (${ownerId}, 'Workflow Owner')
    `;
    await sql`
      insert into public.tenant_memberships (
        tenant_id, user_id, role, status, activated_at
      ) values (${tenantId}, ${ownerId}, 'OWNER', 'ACTIVE', now())
    `;
    const rooms = await sql<{ id: string; room_code: string }[]>`
      insert into public.room_inventory (tenant_id, room_code, species)
      values
        (${tenantId}, 'CAT01', 'CAT'),
        (${tenantId}, 'CAT02', 'CAT'),
        (${tenantId}, 'DOG01', 'DOG')
      returning id, room_code
    `;
    for (const room of rooms) roomIds[room.room_code] = room.id;
  });

  afterAll(async () => {
    await sql`delete from public.audit_logs where tenant_id = ${tenantId}`;
    await sql`delete from public.tenants where id = ${tenantId}`;
    await sql`delete from auth.users where id = ${ownerId}`;
    await sql.end();
  });

  async function asOwner<T>(
    callback: (transaction: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    return (await sql.begin(async (transaction) => {
      await transaction`select set_config('request.jwt.claim.sub', ${ownerId}, true)`;
      await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;
      await transaction.unsafe("set local role authenticated");
      return callback(transaction);
    })) as T;
  }

  async function asService<T>(
    callback: (transaction: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    return (await sql.begin(async (transaction) => {
      await transaction`select set_config('request.jwt.claim.role', 'service_role', true)`;
      await transaction.unsafe("set local role service_role");
      return callback(transaction);
    })) as T;
  }

  it("creates and confirms a multi-room booking with explicit pet assignments", async () => {
    const result = await asOwner(
      (transaction) => transaction<{ result: CreatedBookingResult }[]>`
      select public.create_back_office_booking(
        ${tenantId}, 'เจ้าของหลายห้อง', '0811111111', null, 'PHONE',
        '2026-09-01', '2026-09-03', null,
        ${sql.json([
          {
            species: "CAT",
            roomId: roomIds.CAT01,
            pets: [{ name: "ชาไทย", weightKg: null }],
          },
          {
            species: "DOG",
            roomId: roomIds.DOG01,
            pets: [{ name: "ด่าง", weightKg: 12 }],
          },
        ])}::jsonb
      ) as result
    `,
    );
    const groupId = result[0]!.result.bookingGroupId as string;
    const bookings = await sql<
      { id: string; version: number; booking_code: string }[]
    >`
      select id, version, booking_code from public.bookings
      where booking_group_id = ${groupId} order by booking_code
    `;
    expect(bookings).toHaveLength(2);
    const assignments = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.booking_pets
      where booking_id in (select id from public.bookings where booking_group_id = ${groupId})
    `;
    expect(assignments[0]?.count).toBe(2);

    for (const booking of bookings) {
      await asOwner(
        (transaction) => transaction`
          select * from public.review_booking(
            ${booking.id}, 'APPROVE', '', ${booking.version}
          )
        `,
      );
    }
    const confirmed = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.bookings
      where booking_group_id = ${groupId} and status = 'CONFIRMED'
    `;
    expect(confirmed[0]?.count).toBe(2);

    await asOwner(
      (transaction) => transaction`
        select public.create_back_office_booking(
          ${tenantId}, 'ผู้จองขวางห้องเดิม', '0866666666', null, 'PHONE',
          '2026-10-01', '2026-10-04', null,
          ${sql.json([
            {
              species: "CAT",
              roomId: roomIds.CAT01,
              pets: [{ name: "มะลิ", weightKg: null }],
            },
          ])}::jsonb
        )
      `,
    );

    const firstCode = bookings[0]!.booking_code;
    await asService(
      (transaction) => transaction`
        select public.request_public_reschedule(
          ${tenantSlug}, ${firstCode}, '0811111111', '2026-10-01', '2026-10-04', 'เปลี่ยนวันหยุด'
        )
      `,
    );
    const [request] = await sql<{ id: string }[]>`
      select id from public.reschedule_requests where booking_group_id = ${groupId}
    `;
    await asOwner(
      (transaction) => transaction`
        select public.decide_reschedule_request(${request!.id}, 'APPROVE', '')
      `,
    );
    const [moved] = await sql<
      {
        check_in_date: string;
        check_out_date: string;
        count: number;
        cat_room: string;
      }[]
    >`
      select booking_group.check_in_date::text, booking_group.check_out_date::text,
             sum(booking.reschedule_count)::integer as count,
             max(room.room_code) filter (where booking.species = 'CAT') as cat_room
      from public.booking_groups booking_group
      join public.bookings booking on booking.booking_group_id = booking_group.id
      join public.room_inventory room on room.id = booking.room_id
      where booking_group.id = ${groupId}
      group by booking_group.id
    `;
    expect(moved).toMatchObject({
      check_in_date: "2026-10-01",
      check_out_date: "2026-10-04",
      count: 2,
      cat_room: "CAT02",
    });
    await expect(
      asService(
        (transaction) => transaction`
          select public.request_public_reschedule(
            ${tenantSlug}, ${firstCode}, '0811111111', '2026-11-01', '2026-11-03', null
          )
        `,
      ),
    ).rejects.toThrow("RESCHEDULE_LIMIT_REACHED");
  });

  it("expires a LINE deposit exactly once and releases capacity once", async () => {
    const result = await asOwner(
      (transaction) => transaction<{ result: CreatedBookingResult }[]>`
      select public.create_back_office_booking(
        ${tenantId}, 'เจ้าของไลน์', '0822222222', 'Uworkflow', 'LINE',
        '2026-11-10', '2026-11-12', null,
        ${sql.json([
          {
            species: "CAT",
            roomId: roomIds.CAT02,
            pets: [{ name: "โกโก้", weightKg: null }],
          },
        ])}::jsonb
      ) as result
    `,
    );
    const groupId = result[0]!.result.bookingGroupId;
    const bookingId = result[0]!.result.bookings[0]!.bookingId;
    const [booking] = await sql<{ version: number }[]>`
      select version from public.bookings where id = ${bookingId}
    `;
    await asOwner(
      (transaction) => transaction`
        select * from public.review_booking(${bookingId}, 'APPROVE', '', ${booking!.version})
      `,
    );
    const [waiting] = await sql<
      { amount_satang: number; status: string; minutes: number }[]
    >`
      select payment.amount_satang, booking.status,
        extract(epoch from (booking.deposit_deadline_at - booking.reviewed_at))::integer / 60 as minutes
      from public.bookings booking
      join public.payments payment
        on payment.booking_group_id = booking.booking_group_id
       and payment.payment_type = 'DEPOSIT'
      where booking.id = ${bookingId}
    `;
    expect(waiting).toMatchObject({
      amount_satang: 50_000,
      status: "APPROVED_AWAITING_DEPOSIT",
      minutes: 60,
    });

    await sql`update public.bookings set deposit_deadline_at = now() - interval '1 second' where id = ${bookingId}`;
    const first = await asService(
      (transaction) => transaction<{ count: number }[]>`
        select public.expire_due_line_deposits(100) as count
      `,
    );
    const second = await asService(
      (transaction) => transaction<{ count: number }[]>`
        select public.expire_due_line_deposits(100) as count
      `,
    );
    expect(first[0]?.count).toBe(1);
    expect(second[0]?.count).toBe(0);
    const [facts] = await sql<
      { status: string; allocation_status: string; events: number }[]
    >`
      select booking.status, allocation.status as allocation_status,
        (select count(*)::integer from public.outbox_events event
         where event.aggregate_id = ${groupId} and event.event_type = 'LINE_DEPOSIT_EXPIRED') as events
      from public.bookings booking
      join public.room_allocations allocation on allocation.booking_id = booking.id
      where booking.id = ${bookingId}
    `;
    expect(facts).toMatchObject({
      status: "EXPIRED_PAYMENT",
      allocation_status: "EXPIRED",
      events: 1,
    });
  });

  it("creates one 500 THB deposit for a multi-room LINE booking group", async () => {
    const result = await asOwner(
      (transaction) => transaction<{ result: CreatedBookingResult }[]>`
        select public.create_back_office_booking(
          ${tenantId}, 'เจ้าของไลน์หลายห้อง', '0877777777', 'Ugroupdeposit', 'LINE',
          '2027-04-10', '2027-04-12', null,
          ${sql.json([
            {
              species: "CAT",
              roomId: roomIds.CAT01,
              pets: [{ name: "มะพร้าว", weightKg: null }],
            },
            {
              species: "DOG",
              roomId: roomIds.DOG01,
              pets: [{ name: "ถั่ว", weightKg: 12 }],
            },
          ])}::jsonb
        ) as result
      `,
    );
    const groupId = result[0]!.result.bookingGroupId;
    const bookings = await sql<{ id: string; version: number }[]>`
      select id, version from public.bookings
      where booking_group_id = ${groupId} order by id
    `;
    for (const booking of bookings) {
      await asOwner(
        (transaction) => transaction`
          select * from public.review_booking(
            ${booking.id}, 'APPROVE', '', ${booking.version}
          )
        `,
      );
    }
    const [facts] = await sql<
      { payment_count: number; amount_satang: number; waiting_units: number }[]
    >`
      select
        (select count(*)::integer from public.payments payment
          where payment.booking_group_id = ${groupId}
            and payment.payment_type = 'DEPOSIT') as payment_count,
        (select amount_satang from public.payments payment
          where payment.booking_group_id = ${groupId}
            and payment.payment_type = 'DEPOSIT') as amount_satang,
        count(*) filter (
          where booking.status = 'APPROVED_AWAITING_DEPOSIT'
        )::integer as waiting_units
      from public.bookings booking where booking.booking_group_id = ${groupId}
    `;
    expect(facts).toMatchObject({
      payment_count: 1,
      amount_satang: 50_000,
      waiting_units: 2,
    });
  });

  it("allows only one of two public requests to take the final room", async () => {
    const dates = { checkIn: "2027-01-01", checkOut: "2027-01-03" };
    const request = (key: string, phone: string) =>
      asService(
        (transaction) => transaction`
          select public.create_public_booking_request(
            ${tenantSlug}, ${key}, ${"a".repeat(64)}, ${"b".repeat(64)},
            'ลูกค้าสาธารณะ', ${phone}, ${dates.checkIn}, ${dates.checkOut}, 'DOG',
            ${sql.json([{ name: "หมา", weightKg: 10 }])}::jsonb, null
          )
        `,
      );
    const attempts = await Promise.allSettled([
      request(randomUUID(), "0833333333"),
      request(randomUUID(), "0844444444"),
    ]);
    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
  });

  it("returns one result for concurrent retries with the same idempotency key", async () => {
    const key = randomUUID();
    const request = () =>
      asService(
        (transaction) => transaction<{ result: CreatedBookingResult }[]>`
          select public.create_public_booking_request(
            ${tenantSlug}, ${key}, ${"c".repeat(64)}, ${"d".repeat(64)},
            'ลูกค้ากดซ้ำ', '0855555555', '2027-02-01', '2027-02-03', 'CAT',
            ${sql.json([{ name: "ข้าวปั้น", weightKg: null }])}::jsonb, null
          ) as result
        `,
      );

    const [first, second] = await Promise.all([request(), request()]);
    expect(first[0]!.result.bookingGroupId).toBe(
      second[0]!.result.bookingGroupId,
    );
    const [created] = await sql<{ count: number }[]>`
      select count(*)::integer as count
      from public.booking_groups booking_group
      join public.customers customer on customer.id = booking_group.customer_id
      where booking_group.tenant_id = ${tenantId}
        and customer.phone = '0855555555'
    `;
    expect(created?.count).toBe(1);
  });
});
