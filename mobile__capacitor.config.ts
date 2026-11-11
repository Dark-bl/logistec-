import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.logistec.mobile',
  appName: 'LOGISTEC Mobile',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
