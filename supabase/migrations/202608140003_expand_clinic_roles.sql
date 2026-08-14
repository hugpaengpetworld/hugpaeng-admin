alter type public.clinic_role add value if not exists 'ADMIN' after 'OWNER';
alter type public.clinic_role add value if not exists 'COUNTER' after 'STAFF';
alter type public.clinic_role add value if not exists 'ASSISTANT' after 'COUNTER';

comment on type public.clinic_role is
  'One primary clinic role per membership. Fine-grained permissions are resolved separately and enforced server-side.';
