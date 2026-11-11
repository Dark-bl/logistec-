-- LOGISTEC Mobile · verificación posterior a 20261111_mobile_gps_roles.sql
-- Consulta de solo lectura. No modifica datos ni permisos.
with checks as (
  select 'Tabla gps_sessions' as item, to_regclass('public.gps_sessions') is not null as passed
  union all select 'Tabla gps_session_pauses', to_regclass('public.gps_session_pauses') is not null
  union all select 'Columna gps_positions.session_id', exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='gps_positions' and column_name='session_id'
  )
  union all select 'Columna gps_positions.client_position_id', exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='gps_positions' and column_name='client_position_id'
  )
  union all select 'Columna gps_positions.speed_mps', exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='gps_positions' and column_name='speed_mps'
  )
  union all select 'Columna gps_positions.heading_deg', exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='gps_positions' and column_name='heading_deg'
  )
  union all select 'RPC start_gps_session', to_regprocedure('public.start_gps_session(text,text)') is not null
  union all select 'RPC pause_gps_session', to_regprocedure('public.pause_gps_session(uuid)') is not null
  union all select 'RPC resume_gps_session', to_regprocedure('public.resume_gps_session(uuid)') is not null
  union all select 'RPC finish_gps_session', to_regprocedure('public.finish_gps_session(uuid)') is not null
  union all select 'RPC ingest_gps_position', to_regprocedure('public.ingest_gps_position(uuid,uuid,double precision,double precision,double precision,double precision,double precision,timestamptz)') is not null
  union all select 'RLS gps_sessions', coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.gps_sessions')),false)
  union all select 'RLS gps_session_pauses', coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.gps_session_pauses')),false)
  union all select 'RLS gps_positions', coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.gps_positions')),false)
  union all select 'Política GPS posiciones de lectura', exists (
    select 1 from pg_policies where schemaname='public' and tablename='gps_positions' and policyname='gps_positions_select'
  )
  union all select 'Política sesiones GPS de lectura', exists (
    select 1 from pg_policies where schemaname='public' and tablename='gps_sessions' and policyname='gps_sessions_select'
  )
  union all select 'Política viewer de incidencias', exists (
    select 1 from pg_policies where schemaname='public' and tablename='driver_incidents' and policyname='driver_incidents_select'
  )
  union all select 'Cliente authenticated sin INSERT directo GPS', not has_table_privilege('authenticated','public.gps_positions','INSERT')
  union all select 'Realtime gps_positions', exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gps_positions'
  )
  union all select 'Realtime gps_sessions', exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gps_sessions'
  )
  union all select 'Índice de deduplicación de posiciones', exists (
    select 1 from pg_indexes where schemaname='public' and tablename='gps_positions' and indexname='idx_gps_positions_client_dedupe'
  )
)
select item, case when passed then 'APROBADO' else 'PENDIENTE' end as estado
from checks
order by passed, item;
