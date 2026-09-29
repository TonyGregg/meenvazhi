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
};

export default config;
