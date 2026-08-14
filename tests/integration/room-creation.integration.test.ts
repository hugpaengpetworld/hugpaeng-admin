import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("owner room creation", () => {
  const sql = postgres(databaseUrl!, { max: 8 });
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const staffId = randomUUID();

  beforeAll(async () => {
    await sql`
      insert into auth.users (id, email)
      values
        (${ownerId}, ${`room-owner-${ownerId}@example.invalid`}),
        (${staffId}, ${`room-staff-${staffId}@example.invalid`})
    `;
    await sql`
      insert into public.tenants (id, slug, thai_name, english_name)
      values (${tenantId}, ${`room-create-${tenantId}`}, 'คลินิกทดสอบห้อง', 'Room Test Clinic')
    `;
    await sql`
      insert into public.profiles (user_id, display_name)
      values (${ownerId}, 'Owner'), (${staffId}, 'Staff')
    `;
    await sql`
      insert into public.tenant_memberships (tenant_id, user_id, role, status, activated_at)
      values
        (${tenantId}, ${ownerId}, 'OWNER', 'ACTIVE', now()),
        (${tenantId}, ${staffId}, 'STAFF', 'ACTIVE', now())
    `;
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

  it("creates unique sequential codes during concurrent owner requests", async () => {
    const results = await Promise.all([
      asUser(
        ownerId,
        (transaction) => transaction<{ room_code: string }[]>`
          select room_code from public.create_next_room(${tenantId}, 'CAT')
        `,
      ),
      asUser(
        ownerId,
        (transaction) => transaction<{ room_code: string }[]>`
          select room_code from public.create_next_room(${tenantId}, 'CAT')
        `,
      ),
    ]);

    expect(
      results
        .flat()
        .map((row) => row.room_code)
        .sort(),
    ).toEqual(["CAT01", "CAT02"]);
    const [audit] = await sql<{ count: number }[]>`
      select count(*)::integer as count
      from public.audit_logs
      where tenant_id = ${tenantId} and action = 'ROOM_CREATED'
    `;
    expect(audit?.count).toBe(2);
  });

  it("denies staff and direct table inserts", async () => {
    await expect(
      asUser(
        staffId,
        (transaction) => transaction`
          select * from public.create_next_room(${tenantId}, 'DOG')
        `,
      ),
    ).rejects.toThrow("FORBIDDEN");

    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          insert into public.room_inventory (tenant_id, room_code, species)
          values (${tenantId}, 'DOG01', 'DOG')
        `,
      ),
    ).rejects.toThrow();
  });

  it("retires an unused room without deleting its history row", async () => {
    const [created] = await asUser(
      ownerId,
      (transaction) => transaction<
        { room_id: string; room_code: string; version: number }[]
      >`
        select room_id, room_code, version
        from public.create_next_room(${tenantId}, 'DOG')
      `,
    );
    expect(created).toBeDefined();

    const [retired] = await asUser(
      ownerId,
      (transaction) => transaction<
        { room_code: string; retired_at: Date; version: number }[]
      >`
        select room_code, retired_at, version
        from public.retire_room(
          ${created!.room_id},
          ${created!.version},
          'ยกเลิกห้องทดสอบถาวร'
        )
      `,
    );
    expect(retired?.room_code).toBe(created!.room_code);
    expect(retired?.retired_at).toBeInstanceOf(Date);

    const [stored] = await sql<
      { operational_status: string; retirement_reason: string }[]
    >`
      select operational_status, retirement_reason
      from public.room_inventory
      where id = ${created!.room_id}
    `;
    expect(stored).toEqual({
      operational_status: "DISABLED",
      retirement_reason: "ยกเลิกห้องทดสอบถาวร",
    });

    const plan = await asUser(
      ownerId,
      (transaction) => transaction<{ room_id: string }[]>`
        select room_id
        from public.get_room_plan(${tenantId}, 'DOG', current_date)
      `,
    );
    expect(plan.some((room) => room.room_id === created!.room_id)).toBe(false);

    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select *
          from public.change_room_operational_state(
            ${created!.room_id},
            'AVAILABLE',
            '',
            ${retired!.version}
          )
        `,
      ),
    ).rejects.toThrow("ROOM_RETIRED");

    const [audit] = await sql<{ count: number }[]>`
      select count(*)::integer as count
      from public.audit_logs
      where tenant_id = ${tenantId}
        and entity_id = ${created!.room_id}
        and action = 'ROOM_RETIRED'
    `;
    expect(audit?.count).toBe(1);
  });

  it("denies room retirement to staff", async () => {
    const [created] = await asUser(
      ownerId,
      (transaction) => transaction<{ room_id: string; version: number }[]>`
        select room_id, version
        from public.create_next_room(${tenantId}, 'DOG')
      `,
    );

    await expect(
      asUser(
        staffId,
        (transaction) => transaction`
          select *
          from public.retire_room(
            ${created!.room_id},
            ${created!.version},
            'พนักงานไม่มีสิทธิ์ลบห้อง'
          )
        `,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("keeps a room that still has an active allocation or open stay", async () => {
    const customerId = randomUUID();
    const groupId = randomUUID();
    const bookingId = randomUUID();
    const [created] = await asUser(
      ownerId,
      (transaction) => transaction<{ room_id: string; version: number }[]>`
        select room_id, version
        from public.create_next_room(${tenantId}, 'DOG')
      `,
    );

    await sql`
      insert into public.customers (id, tenant_id, full_name, phone)
      values (${customerId}, ${tenantId}, 'ลูกค้าทดสอบ', '0812345678')
    `;
    await sql`
      insert into public.booking_groups (
        id, tenant_id, customer_id, channel, check_in_date, check_out_date
      ) values (
        ${groupId}, ${tenantId}, ${customerId}, 'PHONE',
        current_date + 1, current_date + 2
      )
    `;
    await sql`
      insert into public.bookings (
        id, tenant_id, booking_group_id, room_id, booking_code, species,
        animal_count, status, nightly_rate_satang
      ) values (
        ${bookingId}, ${tenantId}, ${groupId}, ${created!.room_id},
        ${`ROOM-RETIRE-${bookingId}`}, 'DOG', 1, 'CONFIRMED', 15000
      )
    `;
    await sql`
      insert into public.room_allocations (
        tenant_id, booking_id, room_id, start_date, end_date, status, created_by
      ) values (
        ${tenantId}, ${bookingId}, ${created!.room_id},
        current_date + 1, current_date + 2, 'RESERVED', ${ownerId}
      )
    `;

    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select *
          from public.retire_room(
            ${created!.room_id},
            ${created!.version},
            'ยังมีรายการจอง'
          )
        `,
      ),
    ).rejects.toThrow("ACTIVE_ROOM_ALLOCATION_EXISTS");

    const [stored] = await sql<{ retired_at: Date | null }[]>`
      select retired_at from public.room_inventory where id = ${created!.room_id}
    `;
    expect(stored?.retired_at).toBeNull();

    await sql`
      update public.room_allocations
      set status = 'RELEASED',
          released_at = now(),
          release_reason = 'เปลี่ยนเป็นการทดสอบ open stay'
      where tenant_id = ${tenantId} and booking_id = ${bookingId}
    `;
    await sql`
      insert into public.room_stays (
        tenant_id, booking_id, room_id, checked_in_at, checked_in_by
      ) values (
        ${tenantId}, ${bookingId}, ${created!.room_id}, now(), ${ownerId}
      )
    `;

    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select *
          from public.retire_room(
            ${created!.room_id},
            ${created!.version},
            'ยังมีสัตว์เข้าพักอยู่'
          )
        `,
      ),
    ).rejects.toThrow("OPEN_STAY_EXISTS");
  });
});
