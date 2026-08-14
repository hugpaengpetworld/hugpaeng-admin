import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("patient registry and tenant capabilities", () => {
  const sql = postgres(databaseUrl!, { max: 8 });
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const restrictedStaffId = randomUUID();

  beforeAll(async () => {
    await sql`
      insert into auth.users (id, email)
      values
        (${ownerId}, ${`registry-owner-${ownerId}@example.invalid`}),
        (${adminId}, ${`registry-admin-${adminId}@example.invalid`}),
        (${restrictedStaffId}, ${`registry-staff-${restrictedStaffId}@example.invalid`})
    `;
    await sql`
      insert into public.tenants (id, slug, thai_name, english_name)
      values
        (${tenantId}, ${`registry-${tenantId}`}, 'Registry Clinic', 'Registry Clinic'),
        (${otherTenantId}, ${`registry-other-${otherTenantId}`}, 'Other Clinic', 'Other Clinic')
    `;
    await sql`
      insert into public.profiles (user_id, display_name)
      values
        (${ownerId}, 'Registry Owner'),
        (${adminId}, 'Registry Admin'),
        (${restrictedStaffId}, 'Restricted Staff')
    `;
    await sql`
      insert into public.tenant_memberships (
        tenant_id, user_id, role, status, activated_at
      ) values
        (${tenantId}, ${ownerId}, 'OWNER', 'ACTIVE', now()),
        (${tenantId}, ${adminId}, 'ADMIN', 'ACTIVE', now()),
        (${tenantId}, ${restrictedStaffId}, 'STAFF', 'ACTIVE', now())
    `;
    await sql`
      insert into public.tenant_membership_permission_overrides (
        tenant_id, membership_id, permission_code, is_allowed
      )
      select membership.tenant_id, membership.id, catalog.code,
        catalog.code in ('CUSTOMERS_READ', 'PETS_READ')
      from public.tenant_memberships membership
      cross join public.permission_catalog catalog
      where membership.tenant_id = ${tenantId}
        and membership.user_id = ${restrictedStaffId}
    `;
  });

  afterAll(async () => {
    await sql`delete from public.audit_logs where tenant_id in (${tenantId}, ${otherTenantId})`;
    await sql`delete from public.tenants where id in (${tenantId}, ${otherTenantId})`;
    await sql`delete from auth.users where id in (${ownerId}, ${adminId}, ${restrictedStaffId})`;
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

  it("issues one immutable tenant HN for every pet", async () => {
    const [created] = await asUser(
      ownerId,
      (transaction) => transaction<
        { customer_id: string; created_pets: { petId: string; hn: string }[] }[]
      >`
        select customer_id, created_pets
        from public.create_registry_customer_with_pets(
          ${tenantId}, 'Multi Pet Owner', '0810000001', null, null,
          ${sql.json([
            { name: "Mali", species: "CAT", sex: "FEMALE" },
            { name: "Mochi", species: "DOG", sex: "MALE" },
          ])}::jsonb
        )
      `,
    );

    expect(created?.created_pets).toHaveLength(2);
    const hns = created!.created_pets.map((pet) => pet.hn);
    expect(new Set(hns).size).toBe(2);
    expect(hns.every((hn) => /^HN-\d{6,}$/.test(hn))).toBe(true);

    await expect(
      sql`
        update public.pets set hn = 'HN-999999'
        where id = ${created!.created_pets[0]!.petId}
      `,
    ).rejects.toThrow("HN_IMMUTABLE");
  });

  it("serializes duplicate registry creation by tenant and phone", async () => {
    const phone = "0810000002";
    const attempts = await Promise.allSettled([
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.create_registry_customer(${tenantId}, 'First', ${phone})
        `,
      ),
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.create_registry_customer(${tenantId}, 'Second', ${phone})
        `,
      ),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);

    const [stored] = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.customers
      where tenant_id = ${tenantId} and phone = ${phone}
    `;
    expect(stored?.count).toBe(1);
  });

  it("blocks cross-tenant registry search", async () => {
    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select * from public.search_patient_registry(${otherTenantId}, '081')
        `,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("enforces overrides in RLS and direct RPC calls", async () => {
    const visible = await asUser(
      restrictedStaffId,
      (transaction) => transaction<{ count: number }[]>`
        select count(*)::integer as count from public.customers
        where tenant_id = ${tenantId}
      `,
    );
    expect(visible[0]!.count).toBeGreaterThan(0);

    const hiddenBookings = await asUser(
      restrictedStaffId,
      (transaction) => transaction<{ count: number }[]>`
        select count(*)::integer as count from public.bookings
        where tenant_id = ${tenantId}
      `,
    );
    expect(hiddenBookings[0]!.count).toBe(0);

    await expect(
      asUser(
        restrictedStaffId,
        (transaction) => transaction`
          select public.create_back_office_booking(
            ${tenantId}, 'Denied', '0810000003', null, 'PHONE',
            current_date + 1, current_date + 2, null, '[]'::jsonb
          )
        `,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("lets ADMIN manage capabilities but never an OWNER account", async () => {
    const ownerMembership = await sql<{ id: string }[]>`
      select id from public.tenant_memberships
      where tenant_id = ${tenantId} and user_id = ${ownerId}
    `;
    await expect(
      asUser(
        adminId,
        (transaction) => transaction`
          select public.manage_tenant_membership(
            ${ownerMembership[0]!.id}, 'OWNER', 'ACTIVE'
          )
        `,
      ),
    ).rejects.toThrow("ADMIN_CANNOT_MANAGE_OWNER");

    await expect(
      asUser(
        adminId,
        (transaction) => transaction`
          select public.provision_tenant_member(
            ${tenantId}, ${randomUUID()}, 'Forbidden Owner', 'OWNER', array[]::text[]
          )
        `,
      ),
    ).rejects.toThrow("ADMIN_CANNOT_MANAGE_OWNER");

    const staffMembership = await sql<{ id: string }[]>`
      select id from public.tenant_memberships
      where tenant_id = ${tenantId} and user_id = ${restrictedStaffId}
    `;
    await asUser(
      adminId,
      (transaction) => transaction`
        select public.manage_tenant_membership_with_permissions(
          ${staffMembership[0]!.id}, 'STAFF', 'ACTIVE',
          array['CUSTOMERS_READ', 'PETS_READ', 'BOOKINGS_READ']::text[]
        )
      `,
    );
    const [staffCapabilities] = await asUser(
      restrictedStaffId,
      (transaction) => transaction<
        { can_read_bookings: boolean; can_manage_users: boolean }[]
      >`
        select
          public.has_tenant_permission(${tenantId}, 'BOOKINGS_READ') as can_read_bookings,
          public.has_tenant_permission(${tenantId}, 'USERS_MANAGE') as can_manage_users
      `,
    );
    expect(staffCapabilities).toEqual({
      can_read_bookings: true,
      can_manage_users: false,
    });

    await expect(
      asUser(
        ownerId,
        (transaction) => transaction`
          select public.replace_tenant_member_permissions(
            ${staffMembership[0]!.id}, array['USERS_MANAGE']::text[]
          )
        `,
      ),
    ).rejects.toThrow("UNKNOWN_PERMISSION");
  });
});
