# flagiq
Created with CodeSandbox

## Running the app on iOS & Android

Capacitor is configured with a temporary identity of `Flag Game` (`com.flaggame.app`) and uses the React build output in `build/`. Update `capacitor.config.ts` if you need to change the app name or ID before publishing.

1. Install dependencies (requires npm registry access):
   ```bash
   npm install
   ```
2. Build the web assets that ship with the native shells:
   ```bash
   npm run build
   ```
3. Add the native platforms (run once per clone or after deleting the platform folders):
   ```bash
   npx cap add android
   npx cap add ios
   ```
4. Sync the compiled web assets into the native projects:
   ```bash
   npm run cap:sync
   ```
5. Open the native projects in their IDEs:
   ```bash
   npm run cap:open:android
   npm run cap:open:ios
   ```

Notes:
- Apple builds still require a Mac with Xcode and a developer account for signing and simulator/device deployment.
- Android release builds require signing keys (configure in `android/app/build.gradle` after running `cap add android`).
