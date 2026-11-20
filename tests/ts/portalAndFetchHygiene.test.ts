import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TS_ROOT = resolve(import.meta.dirname, '../../resources/ts');

function walkTsFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			files.push(...walkTsFiles(full));
		} else if (/\.(ts|tsx)$/.test(entry)) {
			files.push(full);
		}
	}
	return files;
}

describe('Phase 2B-1 Portal, Fetch & Decomposition Guardrails', () => {
	it('disallows raw createPortal( calls outside PortalRoot and core runtime exports', () => {
		const allowed = new Set([
			'portal/PortalRoot.tsx',
			'entries/ReactInertia.tsx',
			'sdk/core.ts',
		]);
		const offenders: string[] = [];

		for (const file of walkTsFiles(TS_ROOT)) {
			const rel = relative(TS_ROOT, file).replace(/\\/g, '/');
			if (allowed.has(rel)) {
				continue;
			}
			const source = readFileSync(file, 'utf8');
			if (/\bcreatePortal\s*\(/.test(source)) {
				offenders.push(rel);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('disallows raw fetch( or window.fetch( calls outside fetchGatewayJson and FormData uploadTiptapImages', () => {
		const offenders: string[] = [];

		for (const file of walkTsFiles(TS_ROOT)) {
			const rel = relative(TS_ROOT, file).replace(/\\/g, '/');
			if (rel === 'hooks/fetchGatewayJson.ts') {
				continue;
			}
			const source = readFileSync(file, 'utf8');
			const matches = [...source.matchAll(/\b(?:window\.)?fetch\s*\(/g)];
			if (rel === 'tiptap/core/tiptapGatewayClient.ts') {
				expect(matches.length).toBeLessThanOrEqual(1);
				if (matches.length === 1) {
					const idx = matches[0]?.index ?? 0;
					const fnBoundary = source.lastIndexOf('export async function uploadTiptapImages');
					expect(fnBoundary).toBeGreaterThan(-1);
					expect(idx).toBeGreaterThan(fnBoundary);
					expect(source.slice(fnBoundary)).toContain('body: formData');
				}
				continue;
			}
			if (matches.length > 0) {
				offenders.push(`${rel} (${matches.length})`);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('keeps AppShell.tsx, DataViewport.tsx, media.tsx, Field controls, and SchemaForm.tsx within decomposed line budgets', () => {
		const appShellLines = readFileSync(join(TS_ROOT, 'layout/AppShell.tsx'), 'utf8').split('\n').length;
		const dataViewportLines = readFileSync(join(TS_ROOT, 'viewports/DataViewport.tsx'), 'utf8').split('\n').length;
		const mediaLines = readFileSync(join(TS_ROOT, 'fields/media.tsx'), 'utf8').split('\n').length;
		const fileFieldLines = readFileSync(join(TS_ROOT, 'fields/controls/FileField.tsx'), 'utf8').split('\n').length;
		const imageFieldLines = readFileSync(join(TS_ROOT, 'fields/controls/ImageField.tsx'), 'utf8').split('\n').length;
		const relationFieldLines = readFileSync(join(TS_ROOT, 'fields/controls/RelationField.tsx'), 'utf8').split('\n').length;
		const schemaFormLines = readFileSync(join(TS_ROOT, 'fields/SchemaForm.tsx'), 'utf8').split('\n').length;

		expect(appShellLines).toBeLessThan(600);
		expect(dataViewportLines).toBeLessThan(950);
		expect(mediaLines).toBeLessThan(150);
		expect(fileFieldLines).toBeLessThan(1000);
		expect(imageFieldLines).toBeLessThan(1100);
		expect(relationFieldLines).toBeLessThan(900);
		expect(schemaFormLines).toBeLessThan(950);
	});
});
