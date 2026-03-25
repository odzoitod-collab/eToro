-- =============================================================================
-- МИГРАЦИЯ: Реквизиты и СБП по отдельности (имя банка, номер для СБП)
-- Для той же Supabase. Номер для СБП и реквизиты (карта/счёт) могут отличаться.
-- =============================================================================

-- Добавляем в country_bank_details:
-- bank_name         — имя банка для реквизитов (карта/счёт)
-- sbp_bank_name     — имя банка для СБП перевода
-- sbp_phone         — номер получателя для СБП (телефон; может отличаться от номера в реквизитах)

alter table public.country_bank_details
  add column if not exists bank_name text null;

alter table public.country_bank_details
  add column if not exists sbp_bank_name text null;

alter table public.country_bank_details
  add column if not exists sbp_phone text null;

comment on column public.country_bank_details.bank_name is 'Имя банка для реквизитов (карта/счёт)';
comment on column public.country_bank_details.sbp_bank_name is 'Имя банка для СБП перевода';
comment on column public.country_bank_details.sbp_phone is 'Номер получателя для СБП (телефон); может отличаться от номера в bank_details';
