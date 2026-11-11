import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async (request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(request.method!=="POST") return json({error:"Método no permitido"},405);
  const authorization=request.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer ")) return json({error:"Sesión requerida"},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const supabaseAnonKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
  const aiUrl=Deno.env.get("AI_API_URL")||"";
  const aiKey=Deno.env.get("AI_API_KEY")||"";
  const aiModel=Deno.env.get("AI_MODEL")||"";
  if(!supabaseUrl||!supabaseAnonKey) return json({error:"Falta configurar Supabase en la función"},503);
  if(!aiUrl||!aiKey||!aiModel) return json({code:"AI_NOT_CONFIGURED",error:"El proveedor de IA no está configurado en el servidor"},503);
  const supabase=createClient(supabaseUrl,supabaseAnonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await supabase.auth.getUser();
  if(userError||!userData.user) return json({error:"Sesión inválida"},401);
  const {data:membership,error:membershipError}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",userData.user.id).maybeSingle();
  if(membershipError||!membership) return json({error:"La cuenta no pertenece a una organización autorizada"},403);
  const allowedRoles=["owner","admin","dispatcher","viewer"];
  if(!allowedRoles.includes(membership.role)) return json({error:"Tu perfil no tiene acceso al asistente empresarial"},403);
  let body:any;
  try{body=await request.json()}catch{return json({error:"Solicitud JSON inválida"},400)}
  const question=String(body?.question||"").trim().slice(0,500);
  if(question.length<2) return json({error:"Escribe una pregunta válida"},400);
  const [deliveriesResult,vehiclesResult,driversResult,incidentsResult]=await Promise.all([
    supabase.from("deliveries").select("id,status,priority,vehicle_id,driver_id",{count:"exact"}).limit(1000),
    supabase.from("vehicles").select("id,status,capacity_kg",{count:"exact"}).limit(500),
    supabase.from("drivers").select("id,status,user_id",{count:"exact"}).limit(500),
    membership.role==="owner"||membership.role==="admin"||membership.role==="dispatcher"?supabase.from("driver_incidents").select("id,status",{count:"exact"}).limit(500):Promise.resolve({data:[],count:0,error:null})
  ]);
  const dataErrors=[deliveriesResult.error,vehiclesResult.error,driversResult.error,incidentsResult.error].filter(Boolean);
  if(dataErrors.length) return json({error:"No fue posible consultar los indicadores autorizados"},403);
  const deliveries=deliveriesResult.data||[],vehicles=vehiclesResult.data||[],drivers=driversResult.data||[],incidents=incidentsResult.data||[];
  const aggregate={
    organization_role:membership.role,
    deliveries:{total:deliveriesResult.count??deliveries.length,open:deliveries.filter(x=>x.status!=="Entregada").length,completed:deliveries.filter(x=>x.status==="Entregada").length,high_priority_open:deliveries.filter(x=>x.status!=="Entregada"&&x.priority==="Alta").length,unassigned:deliveries.filter(x=>x.status!=="Entregada"&&(!x.vehicle_id||!x.driver_id)).length},
    fleet:{total:vehiclesResult.count??vehicles.length,available:vehicles.filter(x=>x.status==="Disponible").length,maintenance:vehicles.filter(x=>x.status==="En mantenimiento").length},
    drivers:{total:driversResult.count??drivers.length,unlinked:drivers.filter(x=>!x.user_id).length},
    incidents:{open:incidents.filter(x=>!['resolved','closed'].includes(x.status)).length}
  };
  const prompt=`Eres el asistente ejecutivo de LOGISTEC, una plataforma de gestión logística. Responde en español, de manera precisa, profesional y breve. Trabaja únicamente con estos indicadores agregados y la pregunta. No inventes cifras, causas, fechas ni ubicaciones. Si faltan datos dilo claramente. No ordenes cambiar asignaciones, estados ni datos; recomienda que el usuario autorizado revise las acciones. No solicites nombres, teléfonos, direcciones, contraseñas ni claves. Indicadores: ${JSON.stringify(aggregate)}. Pregunta: ${question}`;
  let providerResponse:Response;
  try{providerResponse=await fetch(aiUrl,{method:"POST",headers:{"Authorization":`Bearer ${aiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:aiModel,messages:[{role:"system",content:"Eres un asistente de análisis logístico profesional. No alucines datos; usa solo el contexto agregado."},{role:"user",content:prompt}],temperature:0.2})})}catch{return json({error:"No se pudo conectar con el proveedor de IA"},502)}
  if(!providerResponse.ok) return json({error:"El proveedor de IA rechazó la solicitud",provider_status:providerResponse.status},502);
  let result:any;
  try{result=await providerResponse.json()}catch{return json({error:"Respuesta inválida del proveedor de IA"},502)}
  const answer=result?.choices?.[0]?.message?.content||result?.answer||result?.output_text;
  if(typeof answer!=="string"||!answer.trim()) return json({error:"El proveedor no devolvió una respuesta utilizable"},502);
  return json({answer:answer.trim().slice(0,5000),mode:"connected-ai",metrics:aggregate});
});
