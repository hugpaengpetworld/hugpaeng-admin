-- Allow literal owner and pet name matches anywhere in the stored name while
-- preserving exact and prefix relevance ahead of contains matches.

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
  folded_query text;
  normalized_query text;
begin
  folded_query := lower(clean_query);
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
          or left(customer.phone, char_length(normalized_query)) = normalized_query
        )
      )
      or strpos(lower(customer.full_name), folded_query) > 0
      or exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and (
            strpos(lower(pet.name), folded_query) > 0
            or pet.hn = upper(clean_query)
            or left(pet.hn, char_length(clean_query)) = upper(clean_query)
          )
      )
    )
  order by
    case
      when lower(customer.full_name) = folded_query then 0
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and lower(pet.name) = folded_query
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
      when left(lower(customer.full_name), char_length(folded_query)) = folded_query then 4
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and left(lower(pet.name), char_length(folded_query)) = folded_query
      ) then 5
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and left(pet.hn, char_length(clean_query)) = upper(clean_query)
      ) then 6
      when normalized_query <> ''
        and left(customer.phone, char_length(normalized_query)) = normalized_query then 7
      when strpos(lower(customer.full_name), folded_query) > 0 then 8
      when exists (
        select 1
        from public.pets pet
        where pet.tenant_id = p_tenant_id
          and pet.customer_id = customer.id
          and pet.archived_at is null
          and strpos(lower(pet.name), folded_query) > 0
      ) then 9
      else 10
    end,
    customer.updated_at desc,
    customer.id
  limit 20;
end;
$$;

revoke all on function public.search_patient_registry(uuid, text) from public, anon;
grant execute on function public.search_patient_registry(uuid, text) to authenticated;

comment on function public.search_patient_registry(uuid, text) is
  'Tenant-scoped literal patient search ranked by exact, prefix, then contains relevance.';
