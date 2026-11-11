package com.logistec.mobile.gps;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Captura únicamente durante una jornada iniciada por el conductor desde la app visible. */
public class GpsForegroundService extends Service implements LocationListener {
  public static final String PREFS = "logistec_mobile_gps_native";
  public static final String ACTION_START = "com.logistec.mobile.gps.START";
  public static final String ACTION_PAUSE = "com.logistec.mobile.gps.PAUSE";
  public static final String ACTION_RESUME = "com.logistec.mobile.gps.RESUME";
  public static final String ACTION_STOP = "com.logistec.mobile.gps.STOP";
  public static final String ACTION_FLUSH = "com.logistec.mobile.gps.FLUSH";
  private static final String CHANNEL_ID = "logistec_gps_tracking";
  private static final int NOTIFICATION_ID = 7411;
  private final ExecutorService network = Executors.newSingleThreadExecutor();
  private android.content.SharedPreferences prefs;
  private LocationManager locationManager;
  private ConnectivityManager connectivityManager;
  private ConnectivityManager.NetworkCallback networkCallback;
  private Location lastLocation;
  private long lastAcceptedAt = 0;
  private boolean tracking = false;
  private boolean paused = false;

  @Override public void onCreate() {
    super.onCreate();
    prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
    // Recupera el estado persistido antes de procesar cualquier acción (por ejemplo,
    // una sincronización que arranca una instancia nueva del servicio).
    tracking = prefs.getBoolean("tracking", false);
    paused = prefs.getBoolean("paused", false);
    locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
    connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
    createNotificationChannel();
    registerNetworkCallback();
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      boolean persistedTracking = prefs.getBoolean("tracking", false);
      boolean persistedPaused = prefs.getBoolean("paused", false);
      if (persistedTracking && !persistedPaused) {
        tracking = true; paused = false;
        promoteToForeground("Seguimiento de jornada reanudado por Android", true);
        startLocationUpdates();
        flushQueue();
        return START_STICKY;
      }
      return START_NOT_STICKY;
    }
    String action = intent.getAction();
    if (ACTION_START.equals(action)) {
      String previousSession = prefs.getString("sessionId", "");
      persistCredentials(intent);
      String nextSession = prefs.getString("sessionId", "");
      if (!previousSession.equals(nextSession)) {
        lastLocation = null;
        lastAcceptedAt = 0;
        prefs.edit().putBoolean("pauseUnconfirmed", false).apply();
      }
      tracking = true; paused = false;
      prefs.edit().putBoolean("tracking", true).putBoolean("paused", false).apply();
      promoteToForeground("Compartiendo ubicación durante tu jornada", true);
      startLocationUpdates();
      flushQueue();
    } else if (ACTION_PAUSE.equals(action)) {
      // La pausa apaga el servicio GPS por completo. Si hace falta sincronizar
      // la cola, confirmPause inicia después un servicio dataSync de corta duración.
      paused = true; tracking = false; stopLocationUpdates();
      prefs.edit().putBoolean("tracking", false).putBoolean("paused", true).apply();
      stopForeground(true);
      stopSelf(startId);
    } else if (ACTION_RESUME.equals(action)) {
      paused = false; tracking = true;
      lastLocation = null;
      lastAcceptedAt = 0;
      prefs.edit().putBoolean("tracking", true).putBoolean("paused", false).apply();
      promoteToForeground("Compartiendo ubicación durante tu jornada", true);
      startLocationUpdates();
    } else if (ACTION_STOP.equals(action)) {
      tracking = false; paused = false; stopLocationUpdates();
      prefs.edit().putBoolean("tracking", false).putBoolean("paused", false).apply();
      stopForeground(true);
      stopSelf(startId);
    } else if (ACTION_FLUSH.equals(action)) {
      persistCredentials(intent);
      // Si Android creó una instancia nueva para sincronizar, restaura primero
      // el foreground correcto y la captura activa, sin apagar una jornada.
      if (tracking) {
        promoteToForeground(paused
          ? "Seguimiento pausado. No se captura ubicación."
          : "Compartiendo ubicación durante tu jornada", true);
        if (!paused) startLocationUpdates();
      } else {
        promoteToForeground("Sincronizando posiciones pendientes", false);
      }
      network.execute(() -> {
        flushQueueBlocking();
        if (!tracking) {
          stopForeground(true);
          stopSelf(startId);
        }
      });
    }
    return tracking && !paused ? START_STICKY : START_NOT_STICKY;
  }

  private void promoteToForeground(String message, boolean locationTracking) {
    Notification foregroundNotification = notification(message);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      int type = locationTracking
        ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
      startForeground(NOTIFICATION_ID, foregroundNotification, type);
    } else {
      startForeground(NOTIFICATION_ID, foregroundNotification);
    }
  }

  private void persistCredentials(Intent intent) {
    if (intent == null) return;
    android.content.SharedPreferences.Editor editor = prefs.edit();
    for (String key : new String[]{"sessionId", "supabaseUrl", "publishableKey", "accessToken", "refreshToken", "userId", "edgeFunctionUrl"}) {
      String value = intent.getStringExtra(key);
      if (value != null && !value.isEmpty()) editor.putString(key, value);
    }
    editor.apply();
  }

  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Seguimiento GPS LOGISTEC", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Indica cuándo LOGISTEC está compartiendo la ubicación durante una jornada activa.");
      NotificationManager manager = getSystemService(NotificationManager.class);
      manager.createNotificationChannel(channel);
    }
  }

  private Notification notification(String message) {
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    PendingIntent pending = launch == null ? null : PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    return new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("LOGISTEC Mobile")
      .setContentText(message)
      .setContentIntent(pending)
      .setOngoing(tracking && !paused)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build();
  }
  private void updateNotification(String message) {
    NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    manager.notify(NOTIFICATION_ID, notification(message));
  }

  private void startLocationUpdates() {
    if (!tracking || paused) return;
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      tracking = false; paused = false;
      prefs.edit().putBoolean("tracking", false).putBoolean("paused", false).apply();
      stopForeground(true); stopSelf(); return;
    }
    try {
      if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        // La lectura nativa se limita a 10 s; la política de envío aplica 12 s
        // en movimiento y 60 s detenido para reducir consumo de datos/batería.
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10000L, 0f, this, Looper.getMainLooper());
      } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
        locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000L, 0f, this, Looper.getMainLooper());
      } else {
        updateNotification("Ubicación desactivada. Actívala para continuar la jornada.");
      }
    } catch (SecurityException error) {
      tracking = false; paused = false;
      prefs.edit().putBoolean("tracking", false).putBoolean("paused", false).apply();
      updateNotification("Permiso GPS revocado. Abre LOGISTEC para revisar permisos.");
      stopForeground(true); stopSelf();
    }
  }
  private void stopLocationUpdates() {
    try { locationManager.removeUpdates(this); } catch (SecurityException ignored) {}
  }

  @Override public void onLocationChanged(Location location) {
    if (!tracking || paused || location == null) return;
    long now = System.currentTimeMillis();
    boolean moving = location.hasSpeed() && location.getSpeed() > 1.2f;
    if (!moving && lastLocation != null) {
      long elapsed = Math.max(1L, location.getTime() - lastLocation.getTime());
      moving = lastLocation.distanceTo(location) / (elapsed / 1000f) > 1.2f;
    }
    long minInterval = moving ? 12000L : 60000L;
    if (now - lastAcceptedAt < minInterval) return;
    if (lastLocation != null && location.getLatitude() == lastLocation.getLatitude() && location.getLongitude() == lastLocation.getLongitude() && now - lastAcceptedAt < 60000L) return;
    lastAcceptedAt = now;
    lastLocation = new Location(location);
    JSONObject point = new JSONObject();
    try {
      point.put("sessionId", prefs.getString("sessionId", ""));
      point.put("clientUserId", prefs.getString("userId", ""));
      point.put("clientPositionId", UUID.randomUUID().toString());
      point.put("latitude", location.getLatitude());
      point.put("longitude", location.getLongitude());
      point.put("accuracy", Math.max(1d, location.hasAccuracy() ? location.getAccuracy() : 100d));
      point.put("speed", location.hasSpeed() ? Math.max(0d, location.getSpeed()) : JSONObject.NULL);
      point.put("heading", location.hasBearing() ? (double) location.getBearing() : JSONObject.NULL);
      point.put("capturedAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date(location.getTime())));
      prefs.edit().putString("lastPosition", point.toString()).apply();
      enqueue(point);
      flushQueue();
    } catch (JSONException ignored) {}
  }

  private synchronized void enqueue(JSONObject point) {
    try {
      JSONArray queue = new JSONArray(prefs.getString("queue", "[]"));
      queue.put(point);
      JSONArray capped = new JSONArray();
      int start = Math.max(0, queue.length() - 2500);
      for (int i = start; i < queue.length(); i++) capped.put(queue.get(i));
      prefs.edit().putString("queue", capped.toString()).apply();
    } catch (JSONException ignored) {}
  }

  private void flushQueue() { network.execute(this::flushQueueBlocking); }
  private synchronized void flushQueueBlocking() {
    // En pausa local pero sin confirmación de Supabase, retener los puntos.
    // Así no se transmite una cola mientras el servidor aún considera activa la jornada.
    if (prefs.getBoolean("pauseUnconfirmed", false)) return;
    String url = prefs.getString("edgeFunctionUrl", "");
    String key = prefs.getString("publishableKey", "");
    String token = prefs.getString("accessToken", "");
    if (url.isEmpty() || key.isEmpty() || token.isEmpty() || !hasInternet()) return;
    JSONArray queue;
    try { queue = new JSONArray(prefs.getString("queue", "[]")); } catch (JSONException e) { return; }
    JSONArray remaining = new JSONArray();
    String activeUserId = prefs.getString("userId", "");
    for (int i = 0; i < queue.length(); i++) {
      JSONObject point = queue.optJSONObject(i);
      if (point == null) continue;
      // No mezclar las colas de conductores distintos en un teléfono compartido.
      if (!activeUserId.equals(point.optString("clientUserId", ""))) {
        remaining.put(point);
        continue;
      }
      int code = postPosition(url, key, token, point);
      if (code == 401) {
        token = refreshToken();
        if (token != null) code = postPosition(url, key, token, point);
      }
      if (code >= 400 && code < 500 && code != 401 && code != 408 && code != 429) {
        // 4xx definitivos (posición durante pausa, coordenadas inválidas o sesión ajena):
        // se descartan para no bloquear la cola ni volver a retener ubicaciones no autorizadas.
        continue;
      }
      if (code < 200 || code >= 300) {
        for (int j = i; j < queue.length(); j++) {
          JSONObject pending = queue.optJSONObject(j);
          if (pending != null) remaining.put(pending);
        }
        break;
      }
    }
    prefs.edit().putString("queue", remaining.toString()).apply();
  }

  private int postPosition(String endpoint, String key, String token, JSONObject point) {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(endpoint).openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(12000); connection.setReadTimeout(15000);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json");
      connection.setRequestProperty("Authorization", "Bearer " + token);
      connection.setRequestProperty("apikey", key);
      try (OutputStream output = connection.getOutputStream()) { output.write(point.toString().getBytes(StandardCharsets.UTF_8)); }
      int code = connection.getResponseCode();
      if (code >= 200 && code < 300) return code;
      return code;
    } catch (Exception error) { return 0; }
    finally { if (connection != null) connection.disconnect(); }
  }

  private String refreshToken() {
    HttpURLConnection connection = null;
    try {
      String base = prefs.getString("supabaseUrl", "");
      String key = prefs.getString("publishableKey", "");
      String refresh = prefs.getString("refreshToken", "");
      if (base.isEmpty() || key.isEmpty() || refresh.isEmpty()) return null;
      connection = (HttpURLConnection) new URL(base + "/auth/v1/token?grant_type=refresh_token").openConnection();
      connection.setRequestMethod("POST"); connection.setConnectTimeout(10000); connection.setReadTimeout(12000); connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("apikey", key);
      JSONObject body = new JSONObject(); body.put("refresh_token", refresh);
      try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
      if (connection.getResponseCode() != 200) return null;
      String response = readBody(connection);
      JSONObject parsed = new JSONObject(response);
      String access = parsed.optString("access_token", "");
      String nextRefresh = parsed.optString("refresh_token", refresh);
      if (access.isEmpty()) return null;
      prefs.edit().putString("accessToken", access).putString("refreshToken", nextRefresh).apply();
      return access;
    } catch (Exception error) { return null; }
    finally { if (connection != null) connection.disconnect(); }
  }
  private String readBody(HttpURLConnection connection) throws Exception {
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
      StringBuilder body = new StringBuilder(); String line;
      while ((line = reader.readLine()) != null) body.append(line);
      return body.toString();
    }
  }
  private boolean hasInternet() {
    if (connectivityManager == null) return false;
    android.net.Network active = connectivityManager.getActiveNetwork();
    if (active == null) return false;
    NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(active);
    return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
  }
  private void registerNetworkCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
    try {
      networkCallback = new ConnectivityManager.NetworkCallback() { @Override public void onAvailable(Network network) { flushQueue(); } };
      connectivityManager.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkCallback);
    } catch (Exception ignored) {}
  }
  @Override public void onProviderDisabled(String provider) { updateNotification("GPS desactivado. Activa la ubicación para continuar."); }
  @Override public void onProviderEnabled(String provider) { if (tracking && !paused) startLocationUpdates(); }
  @Override public void onStatusChanged(String provider, int status, android.os.Bundle extras) {}
  @Nullable @Override public IBinder onBind(Intent intent) { return null; }
  @Override public void onDestroy() {
    // No borrar el estado persistido aquí: Android puede recrear un servicio
    // START_STICKY tras recuperar memoria. Solo ACTION_STOP finaliza el rastreo.
    stopLocationUpdates();
    if (networkCallback != null && connectivityManager != null) try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
    network.shutdown();
    super.onDestroy();
  }
}
