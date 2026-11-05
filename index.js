import { registerRootComponent } from 'expo';

import App from './src/shell/Entry';

// Registers the shared Expo root used by web, native, and Electron's web renderer.
registerRootComponent(App);
