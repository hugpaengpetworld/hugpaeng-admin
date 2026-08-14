alter type public.booking_charge_type add value if not exists 'FLEA_TICK_PREVENTION';
alter type public.booking_charge_type add value if not exists 'CAT_COMBINATION_VACCINE';
alter type public.booking_charge_type add value if not exists 'CAT_FELV_VACCINE';
alter type public.booking_charge_type add value if not exists 'DOG_COMBINATION_VACCINE';
alter type public.booking_charge_type add value if not exists 'DOG_SIX_DISEASE_VACCINE';
alter type public.booking_charge_type add value if not exists 'RABIES_VACCINE';
alter type public.booking_charge_type add value if not exists 'MEDICAL_SERVICE';

comment on type public.booking_charge_type is
  'Structured checkout charge catalog; OTHER requires a staff-entered description.';
