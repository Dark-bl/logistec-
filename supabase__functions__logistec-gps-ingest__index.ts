import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Falta la sesión del usuario." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) return json({ error: "La función no tiene la configuración de Supabase." }, 500);

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "La sesión no es válida o expiró." }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "El cuerpo JSON no es válido." }, 400);
  }

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const clientPositionId = typeof payload.clientPositionId === "string" ? payload.clientPositionId : "";
  const latitude = payload.latitude;
  const longitude = payload.longitude;
  const accuracy = payload.accuracy;
  const speed = payload.speed == null ? null : payload.speed;
  const heading = payload.heading == null ? null : payload.heading;
  const capturedAt = typeof payload.capturedAt === "string" ? payload.capturedAt : "";

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(sessionId) || !uuidPattern.test(clientPositionId)) return json({ error: "Identificador de jornada o posición inválido." }, 400);
  if (!finite(latitude) || !finite(longitude) || !finite(accuracy)) return json({ error: "Coordenadas o precisión GPS inválidas." }, 400);
  if (speed !== null && !finite(speed)) return json({ error: "Velocidad inválida." }, 400);
  if (heading !== null && !finite(heading)) return json({ error: "Dirección inválida." }, 400);
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) return json({ error: "Fecha de captura inválida." }, 400);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy <= 0 || accuracy > 5000) {
    return json({ error: "La posición está fuera de los rangos admitidos." }, 422);
  }

  const { data, error } = await supabase.rpc("ingest_gps_position", {
    p_session_id: sessionId,
    p_client_position_id: clientPositionId,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_m: accuracy,
    p_speed_mps: speed,
    p_heading_deg: heading,
    p_captured_at: capturedAt,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23505" ? 409 : 422;
    return json({ error: error.message, code: error.code || null }, status);
  }

  return json({ accepted: true, userId: authData.user.id, result: data });
});
