import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wildmoustachegames.flagiq',
  appName: 'FlagIQ',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
};

export default config;
