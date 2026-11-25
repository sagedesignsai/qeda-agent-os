import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { dependencies } from '../../release/app/package.json';
import paths from '../configs/paths';

const electronVersion = require(
  path.join(paths.rootPath, 'node_modules/electron/package.json'),
).version;

if (
  Object.keys(dependencies || {}).length > 0 &&
  fs.existsSync(paths.appNodeModulesPath)
) {
  const electronRebuildCmd = `../../node_modules/.bin/electron-rebuild --force --types prod,dev,optional --module-dir . --version ${electronVersion}`;
  const cmd =
    process.platform === 'win32'
      ? electronRebuildCmd.replace(/\//g, '\\')
      : electronRebuildCmd;
  execSync(cmd, {
    cwd: paths.appPath,
    stdio: 'inherit',
  });
}
