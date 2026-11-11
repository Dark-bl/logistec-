package com.logistec.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.logistec.mobile.gps.LogistecGpsPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(LogistecGpsPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
