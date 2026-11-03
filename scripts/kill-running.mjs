import { execSync } from 'node:child_process';

// Close running app instances to avoid Windows file locks on build artifacts
if (process.platform === 'win32') {
  try {
    execSync('taskkill /F /IM SmartSub.exe', { stdio: 'ignore' });
  } catch {}
}
