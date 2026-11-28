import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.mdismail.focusly",
  appName: "Focusly",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#f5f5f5",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#f5f5f5",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_focus",
      iconColor: "#FF8A3D",
    },
  },
};

export default config;
