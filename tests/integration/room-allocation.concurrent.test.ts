import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("database tenant and allocation integrity", () => {
  const sql = postgres(databaseUrl!, { max: 5 });
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const staffUser = randomUUID();
  let roomA = "";
  let occupiedRoom = "";
  let bookingOne = "";
  let bookingTwo = "";

  beforeAll(async () => {
    await sql.begin(async (transaction) => {
      await transaction`
        insert into auth.users (id, email)
        values
          (${userA}, ${`owner-${userA}@example.invalid`}),
          (${staffUser}, ${`staff-${staffUser}@example.invalid`})
      `;
      await transaction`
        insert into public.tenants (id, slug, thai_name, english_name)
        values
          (${tenantA}, ${`test-a-${tenantA}`}, 'คลินิกทดสอบ A', 'Test Clinic A'),
          (${tenantB}, ${`test-b-${tenantB}`}, 'คลินิกทดสอบ B', 'Test Clinic B')
      `;
      await transaction`
        insert into public.profiles (user_id, display_name)
        values
          (${userA}, 'Test Owner A'),
          (${staffUser}, 'Test Staff A')
      `;
      await transaction`
        insert into public.tenant_memberships (
          tenant_id, user_id, role, status, activated_at
        ) values (${tenantA}, ${userA}, 'OWNER', 'ACTIVE', now())
      `;
      await transaction`
        insert into public.tenant_memberships (
          tenant_id, user_id, role, status, activated_at
        ) values (${tenantA}, ${staffUser}, 'STAFF', 'ACTIVE', now())
      `;

      const [createdRoom] = await transaction<{ id: string }[]>`
        insert into public.room_inventory (tenant_id, room_code, species)
        values (${tenantA}, 'CAT01', 'CAT')
        returning id
      `;
      roomA = createdRoom!.id;
      const [createdOccupiedRoom] = await transaction<{ id: string }[]>`
        insert into public.room_inventory (tenant_id, room_code, species)
        values (${tenantA}, 'CAT02', 'CAT')
        returning id
      `;
      occupiedRoom = createdOccupiedRoom!.id;
      await transaction`
        insert into public.room_inventory (tenant_id, room_code, species)
        values (${tenantB}, 'CAT01', 'CAT')
      `;

      const [customer] = await transaction<{ id: string }[]>`
        insert into public.customers (tenant_id, full_name, phone)
        values (${tenantA}, 'Test Customer', '+66800000000')
        returning id
      `;
      const groups = await transaction<{ id: string }[]>`
        insert into public.booking_groups (
          tenant_id, customer_id, channel, check_in_date, check_out_date
        ) values
          (${tenantA}, ${customer!.id}, 'PHONE', '2026-09-01', '2026-09-03'),
          (${tenantA}, ${customer!.id}, 'PHONE', '2026-09-01', '2026-09-03'),
          (${tenantA}, ${customer!.id}, 'PHONE', '2026-08-01', '2026-08-02')
        returning id
      `;
      const bookings = await transaction<{ id: string }[]>`
        insert into public.bookings (
          tenant_id, booking_group_id, species, animal_count, nightly_rate_satang, status, room_id
        ) values
          (${tenantA}, ${groups[0]!.id}, 'CAT', 1, 15000, 'PENDING_APPROVAL', null),
          (${tenantA}, ${groups[1]!.id}, 'CAT', 1, 15000, 'PENDING_APPROVAL', null),
          (${tenantA}, ${groups[2]!.id}, 'CAT', 1, 15000, 'CHECKED_IN', ${occupiedRoom})
        returning id
      `;
      bookingOne = bookings[0]!.id;
      bookingTwo = bookings[1]!.id;
      await transaction`
        insert into public.room_stays (
          tenant_id, booking_id, room_id, checked_in_at, checked_in_by
        ) values (
          ${tenantA}, ${bookings[2]!.id}, ${occupiedRoom}, '2026-08-01T02:00:00Z', ${userA}
        )
      `;
    });
  });

  afterAll(async () => {
    await sql`delete from public.audit_logs where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from public.tenants where id in (${tenantA}, ${tenantB})`;
    await sql`delete from auth.users where id in (${userA}, ${staffUser})`;
    await sql.end();
  });

  async function asUser<T>(
    callback: (transaction: postgres.TransactionSql) => Promise<T>,
    actingUser = userA,
  ): Promise<T> {
    return (await sql.begin(async (transaction) => {
      await transaction`select set_config('request.jwt.claim.sub', ${actingUser}, true)`;
      await transaction.unsafe("set local role authenticated");
      return callback(transaction);
    })) as T;
  }

  it("RLS exposes only rooms belonging to the authenticated tenant", async () => {
    const visibleRooms = await asUser(
      (transaction) =>
        transaction<
          { tenant_id: string }[]
        >`select tenant_id from public.room_inventory`,
    );
    expect(visibleRooms).toHaveLength(2);
    expect(visibleRooms.every(({ tenant_id }) => tenant_id === tenantA)).toBe(
      true,
    );
  });

  it("allows exactly one of two concurrent overlapping room allocations", async () => {
    const attempts = await Promise.allSettled([
      asUser(
        (transaction) =>
          transaction`select * from public.allocate_planned_room(${bookingOne}, ${roomA}, 'HOLD')`,
      ),
      asUser(
        (transaction) =>
          transaction`select * from public.allocate_planned_room(${bookingTwo}, ${roomA}, 'HOLD')`,
      ),
    ]);

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const counts = await sql<{ count: number }[]>`
      select count(*)::integer as count
      from public.room_allocations
      where tenant_id = ${tenantA} and status = 'HOLD'
    `;
    expect(counts[0]?.count).toBe(1);
  });

  it("keeps an overdue open physical stay occupied in future room plans", async () => {
    const plan = await asUser(
      (transaction) => transaction<
        { room_id: string; display_status: string }[]
      >`
        select room_id, display_status
        from public.get_room_plan(${tenantA}, 'CAT', '2026-09-10')
      `,
    );
    expect(
      plan.find(({ room_id }) => room_id === occupiedRoom)?.display_status,
    ).toBe("OCCUPIED");
  });

  it("rejects marking an open physical stay available", async () => {
    await expect(
      asUser(
        (transaction) => transaction`
          select * from public.change_room_operational_state(
            ${occupiedRoom}, 'AVAILABLE', '', 1
          )
        `,
      ),
    ).rejects.toMatchObject({ message: "OPEN_STAY_EXISTS" });
  });

  it("rejects STAFF branding metadata writes", async () => {
    await expect(
      asUser(
        (transaction) => transaction`
          insert into public.file_assets (
            tenant_id, storage_path, purpose, entity_type, entity_id,
            mime_type, size_bytes, uploaded_by
          ) values (
            ${tenantA}, ${`${tenantA}/branding/blocked.png`}, 'BRANDING',
            'TENANT', ${tenantA}, 'image/png', 100, ${staffUser}
          )
        `,
        staffUser,
      ),
    ).rejects.toThrow();
  });

  it("rejects STAFF branding object uploads", async () => {
    await expect(
      asUser(
        (transaction) => transaction`
          insert into storage.objects (bucket_id, name, owner_id)
          values (
            'tenant-assets',
            ${`${tenantA}/branding/blocked.png`},
            ${staffUser}
          )
        `,
        staffUser,
      ),
    ).rejects.toThrow();
  });
});
