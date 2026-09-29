import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native Android shell around the same React app the website serves.
 *
 * appId is permanent once the app is on the Play Store: it cannot be changed
 * afterwards without publishing an entirely separate app. It is tied to the
 * GitHub account that hosts the data, which the owner controls.
 */
const config: CapacitorConfig = {
  appId: 'io.github.tonygregg.meenvazhi',
  appName: 'Meenvazhi',
  webDir: 'dist',
  android: {
    // Only HTTPS. The one remote request the app makes is to GitHub Pages.
    allowMixedContent: false,
    // Lets `chrome://inspect` attach to debug builds; release builds ignore it.
    webContentsDebuggingEnabled: true,
  },
  experimental: {
    ios: {
      spm: {
        // Capacitor writes the app's plugin package with Swift tools 5.9 by default,
        // then fills in the iOS deployment target. Tools 5.9 has no constant for
        // iOS 26, so the generated Package.swift fails to resolve ("'v26' is
        // unavailable"). The .v26 constant arrived in Swift tools 6.2.
        swiftToolsVersion: '6.2',
      },
    },
  },
};

export default config;
