-- Rank patient-registry results by relevance and never let a non-phone query
-- turn into an empty phone prefix that matches every customer.

create or replace function public.search_patient_registry(
  p_tenant_id uuid,
  p_query text
)
returns table (
  customer_id uuid,
  customer_name text,
  phone text,
  email text,
  address text,
  pets jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  clean_query text := btrim(coalesce(p_query, ''));
  normalized_query text;
begin
  normalized_query := regexp_replace(clean_query, '[^0-9+]', '', 'g');

  if char_length(clean_query) < 2 or char_length(clean_query) > 120 then
    raise exception using errcode = '22023', message = 'SEARCH_QUERY_INVALID';
  end if;
  if p_tenant_id is null
     or not public.has_tenant_permission(p_tenant_id, 'CUSTOMERS_READ')
     or not public.has_tenant_permission(p_tenant_id, 'PETS_READ') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return query
  select
    customer.id,
    customer.full_name,
    customer.phone,
    customer.email,
    customer.address,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pet.id,
        'hn', pet.hn,
        'name', pet.name,
        'species', pet.species,
        'sex', pet.sex,
        'breed', pet.breed,
        'weightKg', pet.weight_kg,
        'dateOfBirth', pet.date_of_birth,
        'ageText', pet.age_text,
        'colorMarkings', pet.color_markings,
        'microchipNumber', pet.microchip_number,
        'neutered', pet.neutered
      ) order by pet.created_at, pet.id)
      from public.pets pet
      where pet.tenant_id = p_tenant_id
        and pet.customer_id = customer.id
        and pet.archived_at is null
    ), '[]'::jsonb)
  from public.customers customer
  where customer.tenant_id = p_tenant_id
    and customer.archived_at is null
    and (
      (
        normalized_query <> ''
        and (
          customer.phone = normalized_query
          or customer.phone like normalized_query || '%'
        )
      )
      or lower(customer.full_name) like lower(clean_query) || '%'
      or exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and (
            lower(pet.name) like lower(clean_query) || '%'
            or pet.hn = upper(clean_query)
          )
      )
    )
  order by
    case
      when lower(customer.full_name) = lower(clean_query) then 0
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and (
            lower(pet.name) = lower(clean_query)
            or pet.hn = upper(clean_query)
          )
      ) then 0
      when normalized_query <> '' and customer.phone = normalized_query then 0
      else 1
    end,
    case
      when lower(customer.full_name) = lower(clean_query) then 0
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and lower(pet.name) = lower(clean_query)
      ) then 1
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and pet.hn = upper(clean_query)
      ) then 2
      when normalized_query <> '' and customer.phone = normalized_query then 3
      when lower(customer.full_name) like lower(clean_query) || '%' then 4
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and lower(pet.name) like lower(clean_query) || '%'
      ) then 5
      else 6
    end,
    customer.updated_at desc,
    customer.id
  limit 20;
end;
$$;

revoke all on function public.search_patient_registry(uuid, text) from public, anon;
grant execute on function public.search_patient_registry(uuid, text) to authenticated;

comment on function public.search_patient_registry(uuid, text) is
  'Tenant-scoped patient search ranked by exact name, pet/HN, phone, then prefix relevance.';
