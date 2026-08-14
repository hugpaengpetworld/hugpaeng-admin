-- Preserve the already-tested function bodies while removing two PL/pgSQL
-- analyzer warnings. Each replacement is guarded so schema drift fails loudly.
do $migration$
declare
  function_definition text;
  old_fragment text;
  new_fragment text;
begin
  select pg_get_functiondef(
    'public.check_out_booking(uuid,jsonb,jsonb,boolean,text,integer,text)'::regprocedure
  ) into function_definition;

  old_fragment := 'payment_method public.checkout_payment_method := ''NOT_SPECIFIED'';';
  new_fragment := 'payment_method public.checkout_payment_method := ''NOT_SPECIFIED''::public.checkout_payment_method;';
  if strpos(function_definition, old_fragment) = 0 then
    raise exception 'CHECK_OUT_BOOKING_DEFINITION_DRIFT';
  end if;
  execute replace(function_definition, old_fragment, new_fragment);

  select pg_get_functiondef(
    'public.decide_reschedule_request(uuid,text,text)'::regprocedure
  ) into function_definition;

  old_fragment := E'  target_group public.booking_groups%rowtype;\n';
  if strpos(function_definition, old_fragment) = 0 then
    raise exception 'RESCHEDULE_DECLARATION_DEFINITION_DRIFT';
  end if;
  function_definition := replace(function_definition, old_fragment, '');

  old_fragment := E'  select * into target_group from public.booking_groups booking_group\n  where booking_group.id = target_request.booking_group_id for update;\n';
  if strpos(function_definition, old_fragment) = 0 then
    raise exception 'RESCHEDULE_QUERY_DEFINITION_DRIFT';
  end if;
  execute replace(function_definition, old_fragment, '');
end
$migration$;
