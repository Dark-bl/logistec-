package com.logistec.mobile.gps;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
  name = "LogistecGps",
  permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
  }
)
public class LogistecGpsPlugin extends Plugin {
  @PluginMethod
  public void start(PluginCall call) {
    if (!hasLocationPermission()) {
      requestPermissionForAlias("location", call, "startAfterPermission");
      return;
    }
    startAfterLocation(call);
  }

  private boolean hasLocationPermission() {
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
      || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
  }

  @com.getcapacitor.annotation.PermissionCallback
  private void startAfterPermission(PluginCall call) {
    if (!hasLocationPermission()) {
      call.reject("LOGISTEC necesita permiso de ubicación precisa o aproximada para iniciar el GPS.");
      return;
    }
    startAfterLocation(call);
  }

  private void startAfterLocation(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT) {
      requestPermissionForAlias("notifications", call, "startAfterNotifications");
      return;
    }
    startService(call, GpsForegroundService.ACTION_START);
  }

  @com.getcapacitor.annotation.PermissionCallback
  private void startAfterNotifications(PluginCall call) {
    // El permiso de notificaciones es deseable pero opcional para el inicio del servicio.
    startService(call, GpsForegroundService.ACTION_START);
  }

  @PluginMethod public void pause(PluginCall call) {
    getContext().getSharedPreferences(GpsForegroundService.PREFS, 0).edit().putBoolean("pauseUnconfirmed", true).apply();
    startService(call, GpsForegroundService.ACTION_PAUSE);
  }
  @PluginMethod public void confirmPause(PluginCall call) {
    String requestedSession = call.getString("sessionId", "");
    android.content.SharedPreferences prefs = getContext().getSharedPreferences(GpsForegroundService.PREFS, 0);
    String storedSession = prefs.getString("sessionId", "");
    if (requestedSession.isEmpty() || !requestedSession.equals(storedSession)) {
      call.reject("La confirmación no coincide con la jornada GPS del dispositivo.");
      return;
    }
    prefs.edit().putBoolean("pauseUnconfirmed", false).apply();
    startService(call, GpsForegroundService.ACTION_FLUSH);
  }
  @PluginMethod public void resume(PluginCall call) { startService(call, GpsForegroundService.ACTION_RESUME); }
  @PluginMethod public void stop(PluginCall call) {
    getContext().getSharedPreferences(GpsForegroundService.PREFS, 0).edit()
      .putBoolean("tracking", false).putBoolean("paused", false).putBoolean("pauseUnconfirmed", false)
      .remove("accessToken").remove("refreshToken").remove("sessionId").apply();
    getContext().stopService(new Intent(getContext(), GpsForegroundService.class));
    JSObject result = new JSObject(); result.put("stopped", true); call.resolve(result);
  }
  @PluginMethod public void flushPending(PluginCall call) { startService(call, GpsForegroundService.ACTION_FLUSH); }

  @PluginMethod
  public void status(PluginCall call) {
    android.content.SharedPreferences prefs = getContext().getSharedPreferences(GpsForegroundService.PREFS, 0);
    JSObject result = new JSObject();
    result.put("active", prefs.getBoolean("tracking", false));
    result.put("paused", prefs.getBoolean("paused", false));
    result.put("sessionId", prefs.getString("sessionId", ""));
    boolean fine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    boolean coarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    result.put("locationPermission", fine ? "Precisa" : coarse ? "Aproximada" : "Denegada");
    android.location.LocationManager locations = (android.location.LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
    boolean enabled = false;
    try { enabled = locations.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) || locations.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER); }
    catch (Exception ignored) {}
    result.put("locationEnabled", enabled);
    boolean notifications = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    result.put("notificationsPermission", notifications ? "Concedido" : "No concedido");
    try {
      org.json.JSONArray queue = new org.json.JSONArray(prefs.getString("queue", "[]"));
      result.put("queuedCount", queue.length());
      String last = prefs.getString("lastPosition", "");
      if (!last.isEmpty()) {
        org.json.JSONObject saved = new org.json.JSONObject(last);
        JSObject point = new JSObject();
        point.put("latitude", saved.optDouble("latitude"));
        point.put("longitude", saved.optDouble("longitude"));
        point.put("accuracy", saved.optDouble("accuracy"));
        point.put("speed", saved.isNull("speed") ? null : saved.optDouble("speed"));
        point.put("heading", saved.isNull("heading") ? null : saved.optDouble("heading"));
        point.put("capturedAt", saved.optString("capturedAt", ""));
        result.put("lastPosition", point);
      }
    } catch (Exception ignored) { result.put("queuedCount", 0); }
    call.resolve(result);
  }

  private void startService(PluginCall call, String action) {
    Intent intent = new Intent(getContext(), GpsForegroundService.class);
    intent.setAction(action);
    if (GpsForegroundService.ACTION_START.equals(action) || GpsForegroundService.ACTION_FLUSH.equals(action)) {
      String[] keys = {"sessionId", "supabaseUrl", "publishableKey", "accessToken", "refreshToken", "userId", "edgeFunctionUrl"};
      for (String key : keys) {
        String value = call.getString(key);
        if (value != null) intent.putExtra(key, value);
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ContextCompat.startForegroundService(getContext(), intent);
      else getContext().startService(intent);
      JSObject result = new JSObject();
      result.put("accepted", true);
      result.put("action", action);
      call.resolve(result);
    } catch (Exception error) {
      call.reject("No se pudo iniciar el servicio GPS de Android: " + error.getMessage(), error);
    }
  }
}
