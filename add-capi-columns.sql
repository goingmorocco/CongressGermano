-- Run this once in the Supabase SQL editor to support accurate Meta CAPI matching.
alter table public.registrations
  add column if not exists fbc text,
  add column if not exists fbp text,
  add column if not exists user_agent text;
