with expected_tables(name) as (
  values
    ('delivery_financials'),
    ('financial_expenses'),
    ('route_runs'),
    ('driver_incidents'),
    ('platform_superadmins')
),
expected_columns(table_name,column_name) as (
  values
    ('drivers','user_id'),
    ('delivery_financials','organization_id'),
    ('delivery_financials','delivery_id'),
    ('delivery_financials','revenue_amount'),
    ('financial_expenses','amount'),
    ('financial_expenses','expense_date'),
    ('financial_expenses','category'),
    ('route_runs','distance_km'),
    ('route_runs','fuel_liters'),
    ('route_runs','vehicle_id'),
    ('driver_incidents','driver_user_id'),
    ('driver_incidents','delivery_id'),
    ('driver_incidents','status'),
    ('driver_incidents','resolved_at'),
    ('platform_superadmins','user_id'),
    ('platform_superadmins','enabled')
),
expected_policies(table_name,policy_name) as (
  values
    ('vehicles','vehicles_select'),
    ('drivers','drivers_select'),
    ('deliveries','deliveries_select'),
    ('gps_positions','gps_positions_select'),
    ('gps_positions','gps_positions_insert'),
    ('delivery_financials','delivery_financials_select'),
    ('delivery_financials','delivery_financials_write'),
    ('financial_expenses','financial_expenses_select'),
    ('financial_expenses','financial_expenses_write'),
    ('route_runs','route_runs_select'),
    ('route_runs','route_runs_write'),
    ('driver_incidents','driver_incidents_select'),
    ('driver_incidents','driver_incidents_update')
),
expected_functions(name,argcount) as (
  values
    ('is_platform_superadmin',0),
    ('get_platform_dashboard',0),
    ('driver_update_delivery_status',2),
    ('driver_report_incident',3)
),
checks as (
  select
    '01. TABLAS V1.6' as seccion,
    e.name as elemento,
    case when t.table_name is not null then 'CORRECTO' else 'FALTA' end as resultado,
    'Tabla de V1.6' as detalle
  from expected_tables e
  left join information_schema.tables t
    on t.table_schema='public'
   and t.table_name=e.name
   and t.table_type='BASE TABLE'

  union all

  select
    '02. COLUMNAS V1.6',
    e.table_name||'.'||e.column_name,
    case when c.column_name is not null then 'CORRECTO' else 'FALTA' end,
    coalesce(c.data_type,'Columna inexistente')
  from expected_columns e
  left join information_schema.columns c
    on c.table_schema='public'
   and c.table_name=e.table_name
   and c.column_name=e.column_name

  union all

  select
    '03. RLS V1.6',
    e.name,
    case when c.relrowsecurity then 'CORRECTO' else 'FALTA' end,
    case when c.relforcerowsecurity then 'RLS FORZADO' else 'RLS ACTIVADO' end
  from expected_tables e
  left join pg_class c
    on c.oid=to_regclass(format('public.%I',e.name))

  union all

  select
    '04. POLITICAS V1.6',
    e.table_name||'.'||e.policy_name,
    case when p.policyname is not null then 'CORRECTO' else 'FALTA' end,
    coalesce('Comando: '||p.cmd||' | Roles: '||array_to_string(p.roles,','),'Política no encontrada')
  from expected_policies e
  left join pg_policies p
    on p.schemaname='public'
   and p.tablename=e.table_name
   and p.policyname=e.policy_name

  union all

  select
    '05. FUNCIONES V1.6',
    e.name,
    case
      when p.oid is not null
       and p.prosecdef
       and coalesce(p.proconfig @> array['search_path=""']::text[],false)
       and not has_function_privilege('anon',p.oid,'EXECUTE')
       and has_function_privilege('authenticated',p.oid,'EXECUTE')
      then 'CORRECTO'
      else 'REVISAR'
    end,
    case when p.oid is null then 'Función no encontrada'
      else 'SECURITY DEFINER: '||p.prosecdef::text||' | Parámetros predeterminados: '||p.pronargdefaults::text||' | Configuración: '||coalesce(array_to_string(p.proconfig,','),'sin configuración')
    end
  from expected_functions e
  left join pg_proc p
    on p.pronamespace='public'::regnamespace
   and p.proname=e.name
   and p.pronargs=e.argcount

  union all

  select
    '06. REALTIME V1.6',
    e.name,
    case when p.tablename is not null then 'CORRECTO' else 'FALTA' end,
    'Publicación supabase_realtime'
  from (values
    ('delivery_financials'),
    ('financial_expenses'),
    ('route_runs'),
    ('driver_incidents')
  ) e(name)
  left join pg_publication_tables p
    on p.pubname='supabase_realtime'
   and p.schemaname='public'
   and p.tablename=e.name

  union all

  select
    '07. TABLA SUPERADMIN',
    'platform_superadmins acceso directo',
    case
      when not has_table_privilege('anon','public.platform_superadmins','SELECT')
       and not has_table_privilege('authenticated','public.platform_superadmins','SELECT')
      then 'CORRECTO'
      else 'REVISAR'
    end,
    'La tabla no debe tener lectura directa para anon ni authenticated'
)
select *
from checks
order by seccion,elemento;
