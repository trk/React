import { readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

import { ISOLATED_BUILD_ENTRIES } from './entries.manifest.mjs';

const MODULE_DIR = resolve(import.meta.dirname, '..');
const CONFIG_FILE = resolve(MODULE_DIR, 'vite.config.ts');
const DIST_DIR = resolve(MODULE_DIR, 'dist');

async function runBuildPass(entryName) {
	if (entryName === '') {
		delete process.env.VITE_BUILD_ENTRY;
	} else {
		process.env.VITE_BUILD_ENTRY = entryName;
	}
	await build({
		configFile: CONFIG_FILE,
		logLevel: 'warn',
	});
}

await runBuildPass('');
for (const entryName of ISOLATED_BUILD_ENTRIES) {
	await runBuildPass(entryName);
}

for (const fileName of readdirSync(DIST_DIR)) {
	if (fileName.endsWith('.style.js')) {
		rmSync(resolve(DIST_DIR, fileName), { force: true });
	}
	if (/^ReactInertia-.*\.js$/.test(fileName)) {
		throw new Error(`Unexpected shared chunk emitted in dist/: ${fileName}`);
	}
}

console.log(`Built core runtime and ${ISOLATED_BUILD_ENTRIES.length} isolated submodule bundles cleanly.`);
