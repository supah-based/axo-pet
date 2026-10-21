import { copyFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
await copyFile(path.join(root, 'packages/pet-domain/src/wardrobe-preview.mjs'), path.join(root, 'apps/hatchery-web/public/wardrobe/model.mjs'));
