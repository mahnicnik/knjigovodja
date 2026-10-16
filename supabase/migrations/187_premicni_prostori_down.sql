alter table public.business_premises drop constraint if exists business_premises_movable_type_check;
alter table public.business_premises drop column if exists movable_type;
