-- Consulta de SOLO LECTURA: verifica el superadministrador y los RPC del Centro Global.
-- Ejecutar desde Supabase SQL Editor (rol con acceso de inspección).

select
  lower(u.email) as correo,
  u.id as user_id,
  (p.user_id is not null) as registro_superadmin_existe,
  coalesce(p.enabled, false) as superadmin_habilitado,
  p.added_at as habilitado_desde,
  case
    when p.user_id is null then 'FALTA_REGISTRO_SUPERADMIN'
    when p.enabled then 'SUPERADMIN_ACTIVO'
    else 'SUPERADMIN_DESHABILITADO'
  end as resultado_permiso
from auth.users u
left join public.platform_superadmins p on p.user_id = u.id
where lower(u.email) = lower('leonardocima9@gmail.com');

with required_functions(function_name, signature) as (
  values
    ('is_platform_superadmin', 'public.is_platform_superadmin()'),
    ('get_platform_dashboard', 'public.get_platform_dashboard()'),
    ('get_platform_control_center', 'public.get_platform_control_center()'),
    ('platform_update_organization_status', 'public.platform_update_organization_status(uuid,text,text)'),
    ('platform_set_member_role', 'public.platform_set_member_role(uuid,uuid,text)'),
    ('platform_save_plan', 'public.platform_save_plan(uuid,text,text,text,numeric,numeric,integer,integer,integer,jsonb,boolean)'),
    ('platform_upsert_subscription', 'public.platform_upsert_subscription(uuid,uuid,text,timestamptz,text)'),
    ('platform_create_support_ticket', 'public.platform_create_support_ticket(uuid,text,text,text)'),
    ('platform_update_support_ticket', 'public.platform_update_support_ticket(uuid,text,text)'),
    ('platform_set_feature_flag', 'public.platform_set_feature_flag(uuid,text,boolean)'),
    ('platform_save_setting', 'public.platform_save_setting(text,jsonb,text)')
)
select
  f.function_name,
  (p.oid is not null) as funcion_disponible,
  coalesce(p.prosecdef, false) as security_definer,
  case when p.oid is null then false
       else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_puede_ejecutar,
  case when p.oid is null then false
       else not has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_bloqueado
from required_functions f
left join pg_proc p on p.oid = to_regprocedure(f.signature)
order by f.function_name;
