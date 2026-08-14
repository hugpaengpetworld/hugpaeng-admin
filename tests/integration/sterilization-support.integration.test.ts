import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("Phase 7-8 sterilization and temporary support", () => {
  const sql = postgres(databaseUrl!, { max: 12 });
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const ownerId = randomUUID();
  const doctorId = randomUUID();
  const staffId = randomUUID();
  const platformOwnerId = randomUUID();
  const supportId = randomUUID();

  beforeAll(async () => {
    const users: readonly (readonly [string, string])[] = [
      [ownerId, `owner-${ownerId}@example.invalid`],
      [doctorId, `doctor-${doctorId}@example.invalid`],
      [staffId, `staff-${staffId}@example.invalid`],
      [platformOwnerId, `platform-${platformOwnerId}@example.invalid`],
      [supportId, `support-${supportId}@example.invalid`],
    ];
    for (const [id, email] of users)
      await sql`insert into auth.users (id, email) values (${id}, ${email})`;
    await sql`
      insert into public.tenants (id, slug, thai_name, english_name)
      values
        (${tenantId}, ${`phase78-${tenantId}`}, 'คลินิกทดสอบ Phase 7-8', 'Phase 7-8 Clinic'),
        (${otherTenantId}, ${`phase78-other-${otherTenantId}`}, 'คลินิกอื่น', 'Other Clinic')
    `;
    await sql`
      insert into public.profiles (user_id, display_name)
      values
        (${ownerId}, 'Owner'), (${doctorId}, 'Doctor'), (${staffId}, 'Staff'),
        (${platformOwnerId}, 'Platform Owner'), (${supportId}, 'Support Agent')
    `;
    await sql`
      insert into public.tenant_memberships (tenant_id, user_id, role, status, activated_at)
      values
        (${tenantId}, ${ownerId}, 'OWNER', 'ACTIVE', now()),
        (${tenantId}, ${doctorId}, 'DOCTOR', 'ACTIVE', now()),
        (${tenantId}, ${staffId}, 'STAFF', 'ACTIVE', now())
    `;
    await sql`
      insert into public.platform_roles (user_id, role, assigned_by)
      values
        (${platformOwnerId}, 'PLATFORM_OWNER', ${platformOwnerId}),
        (${supportId}, 'SUPPORT_AGENT', ${platformOwnerId})
    `;
    await sql`
      insert into public.customers (tenant_id, full_name, phone)
      values (${tenantId}, 'ลูกค้าทดสอบ', '0812345678'),
             (${otherTenantId}, 'ลูกค้าต่าง tenant', '0899999999')
    `;
  });

  afterAll(async () => {
    await sql`delete from public.audit_logs where tenant_id in (${tenantId}, ${otherTenantId})`;
    await sql`delete from public.tenants where id in (${tenantId}, ${otherTenantId})`;
    await sql`
      delete from public.platform_roles
      where user_id in (${platformOwnerId}, ${supportId})
    `;
    await sql`delete from auth.users where id in (${ownerId}, ${doctorId}, ${staffId}, ${platformOwnerId}, ${supportId})`;
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

  async function createAppointment(
    userId: string,
    suffix: number,
    acknowledgeOverbook = false,
    holidayOverride = false,
  ) {
    return asUser(
      userId,
      (transaction) => transaction`
      select * from public.create_sterilization_appointment(
        ${tenantId}, date '2026-12-15', time '09:00',
        ${`เจ้าของ ${suffix}`}, ${`08123456${String(suffix).padStart(2, "0")}`},
        ${`สัตว์ ${suffix}`}, 'CAT', null, 'FEMALE', null, null,
        '2 ปี', 'ครบตามกำหนด', 'PHONE', null,
        ${acknowledgeOverbook}, ${holidayOverride}
      )
    `,
    );
  }

  it("requires explicit acknowledgement for the fifth active appointment", async () => {
    await Promise.all(
      [1, 2, 3, 4].map((suffix) => createAppointment(staffId, suffix)),
    );
    await expect(createAppointment(staffId, 5)).rejects.toThrow(
      "OVERBOOK_ACKNOWLEDGEMENT_REQUIRED",
    );
    await createAppointment(staffId, 5, true);
    const [facts] = await sql<
      { active_count: number; acknowledged: number; audits: number }[]
    >`
      select
        count(*) filter (where status in ('PENDING_CONFIRMATION', 'CONFIRMED', 'ARRIVED'))::integer as active_count,
        count(*) filter (where overbook_acknowledged)::integer as acknowledged,
        (select count(*)::integer from public.audit_logs where tenant_id = ${tenantId} and action = 'STERILIZATION_OVERBOOK_ACKNOWLEDGED') as audits
      from public.sterilization_appointments
      where tenant_id = ${tenantId} and appointment_date = date '2026-12-15'
    `;
    expect(facts).toMatchObject({
      active_count: 5,
      acknowledged: 1,
      audits: 1,
    });
  });

  it("allows only owner or doctor to override a sterilization holiday", async () => {
    await asUser(
      ownerId,
      (transaction) => transaction`
      select public.save_sterilization_holiday(${tenantId}, date '2026-12-16', 'วันหยุดทดสอบ', true)
    `,
    );
    const createHolidayAppointment = (userId: string, override: boolean) =>
      asUser(
        userId,
        (transaction) => transaction`
      select * from public.create_sterilization_appointment(
        ${tenantId}, date '2026-12-16', time '10:00', 'เจ้าของวันหยุด', '0822222222',
        'วันหยุด', 'DOG', null, 'MALE', null, 8, '1 ปี', null, 'PHONE', null,
        false, ${override}
      )
    `,
      );
    await expect(createHolidayAppointment(staffId, true)).rejects.toThrow(
      "HOLIDAY_OVERRIDE_FORBIDDEN",
    );
    await createHolidayAppointment(doctorId, true);
    const [row] = await sql<{ holiday_override: boolean }[]>`
      select holiday_override from public.sterilization_appointments
      where tenant_id = ${tenantId} and appointment_date = date '2026-12-16'
    `;
    expect(row?.holiday_override).toBe(true);
  });

  it("rejects backward status transitions", async () => {
    const [appointment] = await sql<{ id: string }[]>`
      select id from public.sterilization_appointments
      where tenant_id = ${tenantId} order by created_at limit 1
    `;
    await asUser(
      staffId,
      (transaction) =>
        transaction`select public.update_sterilization_status(${appointment!.id}, 'CONFIRMED')`,
    );
    await asUser(
      staffId,
      (transaction) =>
        transaction`select public.update_sterilization_status(${appointment!.id}, 'ARRIVED')`,
    );
    await asUser(
      staffId,
      (transaction) =>
        transaction`select public.update_sterilization_status(${appointment!.id}, 'COMPLETED')`,
    );
    await expect(
      asUser(
        staffId,
        (transaction) =>
          transaction`select public.update_sterilization_status(${appointment!.id}, 'CONFIRMED')`,
      ),
    ).rejects.toThrow("INVALID_STATUS_TRANSITION");
  });

  it("grants only scoped tenant reads and audits every support session", async () => {
    const [created] = await asUser(
      platformOwnerId,
      (transaction) => transaction<{ grant_id: string }[]>`
      select public.create_support_access_grant(
        ${tenantId}, ${supportId}, 'ตรวจสอบ ticket ด้านข้อมูลลูกค้า', 'SUP-1001',
        array['TENANT_OVERVIEW', 'CUSTOMER_READ']::text[], now(), now() + interval '1 hour'
      ) as grant_id
    `,
    );
    const grantId = created!.grant_id;
    const counts = await asUser(supportId, async (transaction) => {
      await transaction`select public.record_support_access_use(${grantId})`;
      return transaction<
        { own_tenant: number; other_tenant: number; bookings_visible: number }[]
      >`
        select
          (select count(*)::integer from public.customers where tenant_id = ${tenantId}) as own_tenant,
          (select count(*)::integer from public.customers where tenant_id = ${otherTenantId}) as other_tenant,
          (select count(*)::integer from public.bookings where tenant_id = ${tenantId}) as bookings_visible
      `;
    });
    expect(counts[0]).toMatchObject({
      own_tenant: 1,
      other_tenant: 0,
      bookings_visible: 0,
    });
    const [audit] = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.audit_logs
      where tenant_id = ${tenantId} and action = 'SUPPORT_ACCESS_USED' and support_grant_id = ${grantId}
    `;
    expect(audit?.count).toBe(1);

    await asUser(
      platformOwnerId,
      (transaction) => transaction`
      select public.revoke_support_access_grant(${grantId}, 'ปิด ticket แล้ว')
    `,
    );
    await expect(
      asUser(
        supportId,
        (transaction) =>
          transaction`select public.record_support_access_use(${grantId})`,
      ),
    ).rejects.toThrow("SUPPORT_ACCESS_INACTIVE");
    const [afterRevoke] = await asUser(
      supportId,
      (transaction) => transaction<{ count: number }[]>`
      select count(*)::integer as count from public.customers where tenant_id = ${tenantId}
    `,
    );
    expect(afterRevoke?.count).toBe(0);
  });

  it("denies an ACTIVE grant immediately when its time window expires", async () => {
    const [created] = await asUser(
      platformOwnerId,
      (transaction) => transaction<{ grant_id: string }[]>`
      select public.create_support_access_grant(
        ${tenantId}, ${supportId}, 'ทดสอบการหมดอายุทันทีของ grant', 'SUP-1002',
        array['TENANT_OVERVIEW', 'CUSTOMER_READ']::text[], now(), now() + interval '1 hour'
      ) as grant_id
    `,
    );
    await sql`update public.support_access_grants set starts_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = ${created!.grant_id}`;
    const [result] = await asUser(
      supportId,
      (transaction) => transaction<{ count: number }[]>`
      select count(*)::integer as count from public.customers where tenant_id = ${tenantId}
    `,
    );
    expect(result?.count).toBe(0);
    await expect(
      asUser(
        supportId,
        (transaction) =>
          transaction`select public.record_support_access_use(${created!.grant_id})`,
      ),
    ).rejects.toThrow("SUPPORT_ACCESS_INACTIVE");
  });
});
