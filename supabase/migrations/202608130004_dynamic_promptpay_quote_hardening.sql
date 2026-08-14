do $$
declare
  definition text;
  old_fragment text := $fragment$
      if coalesce(p_payment ->> 'receivedConfirmed', 'false') <> 'true'
        or coalesce(p_payment ->> 'quotedAmountSatang', '') !~ '^[0-9]+$'
        or (p_payment ->> 'quotedAmountSatang')::integer <> amount_due
      then$fragment$;
  new_fragment text := $fragment$
      if coalesce(p_payment ->> 'receivedConfirmed', 'false') <> 'true'
        or coalesce(p_payment ->> 'quotedAmountSatang', '') !~ '^[0-9]{1,10}$'
        or (p_payment ->> 'quotedAmountSatang')::bigint <> amount_due::bigint
      then$fragment$;
begin
  select pg_get_functiondef(
    'public.check_out_booking(uuid,jsonb,jsonb,boolean,text,integer,text)'::regprocedure
  ) into definition;
  if position(old_fragment in definition) = 0 then
    raise exception 'CHECK_OUT_PROMPTPAY_HARDENING_TARGET_NOT_FOUND';
  end if;
  execute replace(definition, old_fragment, new_fragment);
end;
$$;

comment on function public.check_out_booking(uuid, jsonb, jsonb, boolean, text, integer, text) is
  'Atomically checks out one physical stay. PromptPay final settlement requires an exact bounded quote and explicit received-funds confirmation.';
