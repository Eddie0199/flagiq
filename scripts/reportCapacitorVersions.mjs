import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readPackageLockVersions() {
  const lockPath = path.join(root, 'package-lock.json');
  const lock = readJson(lockPath);
  const packages = lock.packages || {};

  const core = packages['node_modules/@capacitor/core']?.version || 'missing';
  const ios = packages['node_modules/@capacitor/ios']?.version || 'missing';
  const cli = packages['node_modules/@capacitor/cli']?.version || 'missing';

  return { core, ios, cli };
}

function readPodfileLockVersions() {
  const podfileLockPath = path.join(root, 'ios', 'App', 'Podfile.lock');
  if (!fs.existsSync(podfileLockPath)) {
    return { available: false, versions: {} };
  }

  const text = fs.readFileSync(podfileLockPath, 'utf8');
  const versions = {};
  for (const pod of ['Capacitor', 'CapacitorCordova']) {
    const match = text.match(new RegExp(`\\n  - ${pod} \\(([^)]+)\\)`));
    if (match) versions[pod] = match[1];
  }

  return { available: true, versions };
}

function readBundleConfig() {
  const configPath = path.join(root, 'ios', 'App', 'App', 'capacitor.config.json');
  if (!fs.existsSync(configPath)) {
    return { available: false, packageClassList: [] };
  }

  const config = readJson(configPath);
  const packageClassList = Array.isArray(config.packageClassList)
    ? config.packageClassList
    : [];

  return { available: true, packageClassList };
}

const lockVersions = readPackageLockVersions();
const podVersions = readPodfileLockVersions();
const bundleConfig = readBundleConfig();

console.log('[capacitor-version-report] package-lock @capacitor/core:', lockVersions.core);
console.log('[capacitor-version-report] package-lock @capacitor/ios:', lockVersions.ios);
console.log('[capacitor-version-report] package-lock @capacitor/cli:', lockVersions.cli);
if (podVersions.available) {
  console.log('[capacitor-version-report] Podfile.lock Capacitor:', podVersions.versions.Capacitor || 'missing');
  console.log('[capacitor-version-report] Podfile.lock CapacitorCordova:', podVersions.versions.CapacitorCordova || 'missing');
} else {
  console.log('[capacitor-version-report] Podfile.lock not found (run pod install in macOS CI to populate pod versions)');
}
if (bundleConfig.available) {
  console.log('[capacitor-version-report] ios/App/App/capacitor.config.json packageClassList:', JSON.stringify(bundleConfig.packageClassList));
} else {
  console.log('[capacitor-version-report] ios/App/App/capacitor.config.json not found (run `npx cap sync ios`)');
}
