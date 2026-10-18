import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateDeploymentConfig } from './deployment-config.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const configPath = resolve(argument('--config', 'deployment-config.json'));
try {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const result = validateDeploymentConfig(config);
  console.log(JSON.stringify({ status: result.ok ? 'VALID' : 'BLOCKED', configPath, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: 'BLOCKED', configPath, errors: [error.message] }, null, 2));
  process.exitCode = 1;
}
