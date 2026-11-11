-- Verificación de instalación LOGISTEC V1.9 Global Control
with expected_tables(name) as (
  values ('platform_plans'),('platform_subscriptions'),('platform_support_tickets'),
         ('platform_audit_logs'),('platform_feature_flags'),('platform_settings'),
         ('platform_superadmins')
),
expected_functions(name,signature) as (
  values
    ('get_platform_control_center','public.get_platform_control_center()'),
    ('platform_update_organization_status','public.platform_update_organization_status(uuid,text,text)'),
    ('platform_set_member_role','public.platform_set_member_role(uuid,uuid,text)'),
    ('platform_save_plan','public.platform_save_plan(uuid,text,text,text,numeric,numeric,integer,integer,integer,jsonb,boolean)'),
    ('platform_upsert_subscription','public.platform_upsert_subscription(uuid,uuid,text,timestamp with time zone,text)'),
    ('platform_create_support_ticket','public.platform_create_support_ticket(uuid,text,text,text)'),
    ('platform_update_support_ticket','public.platform_update_support_ticket(uuid,text,text)'),
    ('platform_set_feature_flag','public.platform_set_feature_flag(uuid,text,boolean)'),
    ('platform_save_setting','public.platform_save_setting(text,jsonb,text)'),
    ('current_user_role','public.current_user_role()')
),
checks as (
  select 'TABLA' as tipo, e.name as elemento,
    case when t.table_name is not null then 'CORRECTO' else 'FALTA' end as resultado,
    case when c.relrowsecurity then 'RLS ACTIVADO' else 'RLS INACTIVO O TABLA FALTANTE' end as detalle
  from expected_tables e
  left join information_schema.tables t on t.table_schema='public' and t.table_name=e.name and t.table_type='BASE TABLE'
  left join pg_class c on c.oid=to_regclass(format('public.%I',e.name))
  union all
  select 'FUNCIÓN',e.name,
    case when to_regprocedure(e.signature) is not null then 'CORRECTO' else 'FALTA' end,
    e.signature
  from expected_functions e
  union all
  select 'ACCESO', 'Tablas privadas: acceso directo',
    case when not has_table_privilege('anon','public.platform_plans','SELECT')
      and not has_table_privilege('authenticated','public.platform_plans','SELECT')
      and not has_table_privilege('authenticated','public.platform_audit_logs','SELECT')
      then 'CORRECTO' else 'REVISAR' end,
    'anon/authenticated no deben consultar tablas de control directamente'
  union all
  select 'ACCESO', 'RPC global: privilegios',
    case when not has_function_privilege('anon','public.get_platform_control_center()','EXECUTE')
      and has_function_privilege('authenticated','public.get_platform_control_center()','EXECUTE')
      then 'CORRECTO' else 'REVISAR' end,
    'La función solo se concede a authenticated y valida internamente el rol superadmin'
  union all
  select 'ESTADO', 'Suspensión organizacional',
    case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='platform_status')
      then 'CORRECTO' else 'FALTA' end,
    'organizations.platform_status'
)
select * from checks order by tipo,elemento;
