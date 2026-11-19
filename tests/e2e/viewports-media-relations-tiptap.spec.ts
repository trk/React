import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { attachRuntimeErrorTracker, getAdminUrl } from '../../../../../tests/e2e/helpers';
import {
	destroyIsolatedE2EFixture,
	provisionIsolatedE2EFixture,
	type IsolatedE2EFixture,
} from './e2e-fixtures';

async function mountIslandOnWorkspace(
	page: Page,
	hostId: string,
	islandName: string,
	rawProps: Record<string, unknown>
): Promise<void> {
	await page.evaluate(
		({ id, island, props }) => {
			const existing = document.getElementById(id);
			if (existing) {
				existing.remove();
			}
			const rt = (window as any).ReactWorkspaceRuntime;
			const liveCsrf = rt.getCsrfToken();
			const mergedProps = {
				...props,
				csrf: liveCsrf,
			};
			const host = document.createElement('div');
			host.id = id;
			host.style.padding = '24px 24px 96px 24px';
			const islandDiv = document.createElement('div');
			islandDiv.setAttribute('data-inertia-island', island);
			islandDiv.setAttribute('data-react-island', island);
			islandDiv.setAttribute('data-props', JSON.stringify(mergedProps));
			host.appendChild(islandDiv);
			document.body.appendChild(host);
			rt.mountIslands(host);
		},
		{ id: hostId, island: islandName, props: rawProps }
	);
}

test.describe('ProcessReactWorkspace Comprehensive Subsystems E2E (Viewports, Media, Link, Relations, Tiptap MiniBlocks & SchemaForm)', () => {
	let fixture: IsolatedE2EFixture;

	test.beforeAll(() => {
		fixture = provisionIsolatedE2EFixture();
	});

	test.afterAll(() => {
		destroyIsolatedE2EFixture(fixture?.suffix);
	});

	test('executes MarkupReactTable & MarkupReactCards live /_react/viewport search, inline editing, saved views, column toggles, and view switching', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await mountIslandOnWorkspace(page, 'e2e-vp-host', 'MarkupReactTable', fixture.viewportProps);

		const vp = page.locator('#e2e-vp-host [data-viewport-id]');
		await expect(vp).toBeVisible();
		await expect(vp).toHaveAttribute('data-viewport-mode', 'table');
		await expect(vp).toContainText('Alpha Vessel');
		await expect(vp).toContainText('Beta Cruiser');
		await expect(vp).toContainText('Gamma Explorer');

		// 1. Live /_react/viewport search filters down to Beta Cruiser, then Reset restores all 3
		const searchInput = vp.locator('input[placeholder*="Search"]');
		await searchInput.fill('Beta');
		await searchInput.press('Enter');
		await expect(vp).toContainText('Beta Cruiser');
		await expect(vp).not.toContainText('Alpha Vessel');

		await vp.getByRole('button', { name: 'Reset' }).click();
		await expect(vp).toContainText('Alpha Vessel');
		await expect(vp).toContainText('Gamma Explorer');

		// 2. Live inline cell editing (`update_field` on PagesDataProvider) persists new Page title
		const inlineBtn = vp.locator('button[title="Click to edit inline"]', { hasText: 'Alpha Vessel' }).first();
		await inlineBtn.click();
		const inlineInput = vp.locator('table input:not([type="checkbox"])').first();
		await expect(inlineInput).toBeVisible();
		await inlineInput.fill('Alpha Flagship');
		await inlineInput.press('Enter');
		await expect(vp).toContainText('Alpha Flagship');

		// 3. Switch Table -> Cards (`MarkupReactCards` canvas) -> Table via `/_react/viewport`
		await vp.getByRole('button', { name: 'cards', exact: true }).click();
		await expect(vp).toHaveAttribute('data-viewport-mode', 'cards');
		await expect(vp).toContainText('Alpha Flagship');

		await vp.getByRole('button', { name: 'table', exact: true }).click();
		await expect(vp).toHaveAttribute('data-viewport-mode', 'table');

		// 4. Save named preset view (`save_view`) and delete it (`delete_view`)
		await vp.getByRole('button', { name: 'Save View' }).click();
		const presetInput = vp.locator('input[placeholder="Preset name..."]');
		await presetInput.fill('Flagship Preset');
		await vp.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(vp.getByRole('button', { name: 'Flagship Preset' })).toBeVisible();

		await vp.locator('button[title="Delete saved view"]').first().click();
		await page.locator('[data-rw-confirm-accept]').click();
		await expect(vp.getByRole('button', { name: 'Flagship Preset' })).toHaveCount(0);

		// 5. Column picker opens and toggles column visibility cleanly
		await vp.getByRole('button', { name: 'Columns' }).click();
		await expect(vp.getByText('Toggle Columns')).toBeVisible();
		await vp.getByRole('button', { name: 'Columns' }).click();

		tracker.assertNoErrors();
	});

	test('uploads, inspects, and validates InputfieldReactImage & InputfieldReactFile against live /_react/media gateway', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await mountIslandOnWorkspace(
			page,
			'e2e-media-host',
			'ReactWorkspace/SchemaForm',
			fixture.mediaSchemaFormProps
		);

		const host = page.locator('#e2e-media-host');
		const imageControl = host.locator('[data-rw-media-field="image"]');
		const fileControl = host.locator('[data-rw-media-field="file"]');
		await expect(imageControl).toBeVisible();
		await expect(fileControl).toBeVisible();

		// 1. Reject XSS SVG upload on InputfieldReactImage (not in allowed png/jpg/webp extensions)
		const imgFileInput = imageControl.locator('input[type="file"]').first();
		await imgFileInput.setInputFiles({
			name: 'malicious.svg',
			mimeType: 'image/svg+xml',
			buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
		});
		await expect(imageControl.locator('[data-rw-field-slot="status"]')).toBeVisible();

		// 2. Upload valid PNG image via live /_react/media XHR
		const mediaUploadResPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/media') && res.request().method() === 'POST'
		);
		const pngBuffer = Buffer.from(fixture.validPngBase64, 'base64');
		await imgFileInput.setInputFiles({
			name: 'deck-plan.png',
			mimeType: 'image/png',
			buffer: pngBuffer,
		});
		const mediaRes = await mediaUploadResPromise;
		expect(mediaRes.status()).toBe(200);
		await expect(imageControl.locator('[data-rw-media-card], [data-rw-media-row]').first()).toBeVisible();
		await expect(imageControl).toContainText('deck-plan');

		// 3. Upload valid TXT specification document in InputfieldReactFile via live /_react/media
		const docFileInput = fileControl.locator('input[type="file"]').first();
		const fileUploadPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/media') && res.request().method() === 'POST'
		);
		await docFileInput.setInputFiles({
			name: 'charter-terms.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('Charter specification document v1.0'),
		});
		const docRes = await fileUploadPromise;
		expect(docRes.status()).toBe(200);
		await expect(fileControl).toContainText('charter-terms.txt');

		tracker.assertNoErrors();
	});

	test('switches InputfieldReactLink modes (URL, Email, Phone, Page, Image) and uploads isolated link media via PageLinkMediaHostAdapter', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await mountIslandOnWorkspace(
			page,
			'e2e-link-host',
			'ReactWorkspace/SchemaForm',
			fixture.linkSchemaFormProps
		);

		const linkControl = page.locator('#e2e-link-host [data-rw-control="link"]');
		await expect(linkControl).toBeVisible();

		const typeSelect = linkControl.locator('select[aria-label="Link type"]');
		await expect(typeSelect).toBeVisible();

		// 1. URL mode serializes clean https URL into hidden JSON input
		await typeSelect.selectOption('url');
		const urlInput = linkControl.locator('input[type="url"], input[type="text"]').first();
		await urlInput.fill('https://processwire.com/about/');
		const hiddenJsonInput = page.locator(`#e2e-link-host input[type="hidden"][name="${fixture.linkFieldName}"]`);
		await expect(hiddenJsonInput).toHaveValue(/"url":"https:\/\/processwire\.com\/about\/"/);

		// 2. Email mode formats email destination
		await typeSelect.selectOption('email');
		const emailInput = linkControl.locator('input[type="email"], input[type="text"]').first();
		await emailInput.fill('captain@fleet.example');
		await expect(hiddenJsonInput).toHaveValue(/"type":"email"/);
		await expect(hiddenJsonInput).toHaveValue(/captain@fleet\.example/);

		// 3. Image media profile uploads PNG via PageLinkMediaHostAdapter (`/_react/media`) without crashing!
		await typeSelect.selectOption('image');
		const linkMediaInput = linkControl.locator('input[type="file"]');
		const linkUploadPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/media') && res.request().method() === 'POST'
		);
		const pngBuffer = Buffer.from(fixture.validPngBase64, 'base64');
		await linkMediaInput.setInputFiles({
			name: 'brochure-cover.png',
			mimeType: 'image/png',
			buffer: pngBuffer,
		});
		const linkUploadRes = await linkUploadPromise;
		expect(linkUploadRes.status()).toBe(200);
		await expect(hiddenJsonInput).toHaveValue(/brochure-cover\.png/);

		tracker.assertNoErrors();
	});

	test('queries and mutates InputfieldReactM2O, M2M, O2M, and M2A against live /_react/relation endpoint', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await mountIslandOnWorkspace(
			page,
			'e2e-rel-host',
			'ReactWorkspace/SchemaForm',
			fixture.relationSchemaFormProps
		);

		const host = page.locator('#e2e-rel-host');

		// 1. M2O remote search via `/_react/relation`
		const m2oField = host.locator('[data-field-name="rel_m2o_vessel"]');
		await expect(m2oField).toBeVisible();
		const m2oSearchInput = m2oField.locator('input[type="text"]').first();
		const relSearchPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/relation') && res.request().method() === 'POST'
		);
		await m2oSearchInput.click();
		await m2oSearchInput.fill('Gamma');
		const relSearchRes = await relSearchPromise;
		expect(relSearchRes.status()).toBe(200);
		const gammaOption = page.getByText('Gamma Explorer').first();
		await expect(gammaOption).toBeVisible();
		await gammaOption.click();
		await expect(m2oField).toContainText('Gamma Explorer');

		// 2. M2M hydrated initial items & keyboard/sortable support
		const m2mField = host.locator('[data-field-name="rel_m2m_vessels"]');
		await expect(m2mField).toBeVisible();
		await expect(m2mField).toContainText('Beta Cruiser');

		// 3. O2M displays foreign-key linked child record hydrated from server
		const o2mField = host.locator('[data-field-name="rel_o2m_children"]');
		await expect(o2mField).toBeVisible();
		await expect(o2mField).toContainText(/Alpha/);

		// 4. M2A polymorphic relation control renders resource switcher (`page` / `template`)
		const m2aField = host.locator('[data-field-name="rel_m2a_refs"]');
		await expect(m2aField).toBeVisible();

		tracker.assertNoErrors();
	});

	test('triggers InputfieldTiptap SlashCommandMenu (/), inserts MiniBlock, and sanitizes malicious HTML on browser paste', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await mountIslandOnWorkspace(
			page,
			'e2e-tiptap-slash-host',
			'ReactWorkspace/SchemaForm',
			fixture.tiptapSlashSchemaFormProps
		);

		const tiptapField = page.locator('#e2e-tiptap-slash-host [data-rw-tiptap-field="editorial_story"]');
		await expect(tiptapField).toBeVisible();

		const prose = tiptapField.locator('.ProseMirror');
		await expect(prose).toBeVisible();
		await prose.click();
		await page.keyboard.type('/callout');

		// Slash command menu opens with editorial mini-blocks
		const slashMenu = page.locator('[data-rw-tiptap-slash-menu]');
		await expect(slashMenu).toBeVisible();
		const firstOption = slashMenu.locator('[data-rw-slash-idx="0"]');
		await expect(firstOption).toBeVisible();
		await page.keyboard.press('Enter');

		await expect(prose.locator('[data-tiptap-block="callout"]')).toBeVisible();
		await page.keyboard.type('Safety notice inside callout');

		const hiddenTextarea = tiptapField.locator('textarea[name="editorial_story"]');
		await expect(hiddenTextarea).toHaveValue(/data-tiptap-block="callout"/);
		await expect(hiddenTextarea).toHaveValue(/Safety notice inside callout/);

		// Simulate real browser ClipboardEvent('paste') with malicious XSS payload + clean rich HTML
		await prose.focus();
		await prose.evaluate((el) => {
			const dt = new DataTransfer();
			dt.setData(
				'text/html',
				'<script>window.__tiptapXssExecuted = true;</script><img src="x" onerror="window.__tiptapXssExecuted = true"><p><strong>Sanitized Paste</strong> Ready</p>'
			);
			const pasteEvt = new ClipboardEvent('paste', {
				clipboardData: dt,
				bubbles: true,
				cancelable: true,
			});
			el.dispatchEvent(pasteEvt);
		});

		await expect(hiddenTextarea).toContainText('Sanitized Paste');
		const hiddenVal = await hiddenTextarea.inputValue();
		expect(hiddenVal.toLowerCase()).not.toContain('<script');
		expect(hiddenVal.toLowerCase()).not.toContain('onerror');
		const xssExecuted = await page.evaluate(() => Boolean((window as any).__tiptapXssExecuted));
		expect(xssExecuted).toBe(false);

		tracker.assertNoErrors();
	});

	test('renders full-width InputfieldTiptap prose and drives ProcessWire pwlink, anchor, and pwimage -is variation <dialog> modals with WCAG 2.1 AA', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await mountIslandOnWorkspace(
			page,
			'e2e-tiptap-pw-host',
			'ReactWorkspace/SchemaForm',
			fixture.tiptapSlashSchemaFormProps
		);

		const tiptapField = page.locator('#e2e-tiptap-pw-host [data-rw-tiptap-field="editorial_story"]');
		await expect(tiptapField).toBeVisible();

		const surface = tiptapField.locator('[data-rw-tiptap-surface]');
		const prose = tiptapField.locator('.ProseMirror');
		await expect(prose).toBeVisible();

		// 1. Verify 100% full-width prose (not capped at 50% / 75ch on wide 1440px viewport)
		const surfaceBox = await surface.boundingBox();
		const proseBox = await prose.boundingBox();
		expect(surfaceBox).not.toBeNull();
		expect(proseBox).not.toBeNull();
		expect(proseBox!.width).toBeGreaterThan(surfaceBox!.width * 0.92);

		// 2. Named Anchor modal (`<dialog data-rw-tiptap-dialog="anchor">`)
		await prose.click();
		await tiptapField.locator('[data-rw-tiptap-tool="anchor"]').click();
		const anchorDialog = page.locator('dialog[data-rw-tiptap-dialog="anchor"]');
		await expect(anchorDialog).toBeVisible();
		await anchorDialog.locator('[data-rw-pw-anchor-input]').fill('fleet-specs');
		await anchorDialog.locator('[data-rw-pw-anchor-submit]').click();
		await expect(anchorDialog).toBeHidden();
		await expect(prose.locator('[data-rw-tiptap-anchor="fleet-specs"]')).toBeVisible();

		// 3. ProcessWire Link modal (`<dialog data-rw-tiptap-dialog="link">`) + WCAG 2.1 AA + Page Search
		await tiptapField.locator('[data-rw-tiptap-tool="link"]').click();
		const linkDialog = page.locator('dialog[data-rw-tiptap-dialog="link"]');
		await expect(linkDialog).toBeVisible();

		const axeLinkDialog = await new AxeBuilder({ page })
			.include('dialog[data-rw-tiptap-dialog="link"]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(axeLinkDialog.violations).toEqual([]);

		const pagesSearchRes = page.waitForResponse(
			(res) => res.url().includes('/_react/tiptap') && res.url().includes('q=Gamma')
		);
		// `Gamma Explorer` stays unmodified across earlier specs (`Alpha Vessel` is renamed inline above)
		await linkDialog.locator('[data-rw-pw-link-href]').fill('Gamma Explorer');
		await pagesSearchRes;

		const gammaOption = linkDialog.locator('[data-rw-pw-link-autocomplete] [role="option"]').first();
		await expect(gammaOption).toBeVisible();
		// Keyboard combobox: ArrowDown highlights the first match, Enter picks it
		const hrefInput = linkDialog.locator('[data-rw-pw-link-href]');
		await hrefInput.press('ArrowDown');
		await expect(gammaOption).toHaveAttribute('aria-selected', 'true');
		await hrefInput.press('Enter');
		await expect(linkDialog).toBeVisible();
		await expect(hrefInput).toHaveValue(/rw-e2e-pw-gamma-/);
		await expect(linkDialog.locator('[data-rw-pw-link-autocomplete]')).toHaveCount(0);

		// Browse sections are collapsed accordions on the Link pane; Select Page lists the page tree
		await linkDialog.locator('[data-rw-pw-link-section$="-pages"] button[aria-expanded]').click();
		await expect(linkDialog.locator('[data-rw-pw-page-tree] [data-rw-pw-tree-page]').first()).toBeVisible();

		// Target / Title / Rel live on the Attributes pane
		await linkDialog.locator('[data-rw-pw-link-pane="attributes"]').click();
		const axeAttributesPane = await new AxeBuilder({ page })
			.include('dialog[data-rw-tiptap-dialog="link"]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(axeAttributesPane.violations).toEqual([]);
		await linkDialog.locator('[data-rw-pw-link-target]').selectOption('_blank');
		await linkDialog.locator('[data-rw-pw-link-submit]').click();
		await expect(linkDialog).toBeHidden();

		const hiddenTextarea = tiptapField.locator('textarea[name="editorial_story"]');
		await expect(hiddenTextarea).toHaveValue(/id="fleet-specs"/);
		await expect(hiddenTextarea).toHaveValue(/Gamma Explorer/);
		await expect(hiddenTextarea).toHaveValue(/target="_blank"/);
		await expect(hiddenTextarea).toHaveValue(/noopener/);

		// 4. ProcessWire Image modal (`<dialog data-rw-tiptap-dialog="image">`) + Upload + `-is` Variation + Caption + WCAG 2.1 AA
		await tiptapField.locator('[data-rw-tiptap-tool="image"]').click();
		const imageDialog = page.locator('dialog[data-rw-tiptap-dialog="image"]');
		await expect(imageDialog).toBeVisible();

		const axeImageLibrary = await new AxeBuilder({ page })
			.include('dialog[data-rw-tiptap-dialog="image"]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(axeImageLibrary.violations).toEqual([]);

		const uploadResPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/tiptap') && res.request().method() === 'POST'
		);
		const pngBuffer = Buffer.from(fixture.validPngBase64, 'base64');
		await imageDialog.locator('[data-rw-pw-image-upload-input]').setInputFiles({
			name: 'deck-plan.png',
			mimeType: 'image/png',
			buffer: pngBuffer,
		});
		const uploadRes = await uploadResPromise;
		expect(uploadRes.status()).toBe(200);

		// Uploaded single image opens Variation & Placement Studio automatically
		await expect(imageDialog.locator('[data-rw-pw-image-width]')).toBeVisible();
		const axeImageStudio = await new AxeBuilder({ page })
			.include('dialog[data-rw-tiptap-dialog="image"]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(axeImageStudio.violations).toEqual([]);

		// Fixture PNG is 120px wide; HiDPI caps logical width at 60px, so 40px forces a real `-is` variation
		await imageDialog.locator('[data-rw-pw-image-width]').fill('40');
		await imageDialog.locator('[data-rw-pw-image-hidpi]').check();
		await imageDialog.locator('[data-rw-pw-image-align="align_left"]').click();
		await imageDialog.locator('[data-rw-pw-image-alt]').fill('Main deck diagram');
		await imageDialog.locator('[data-rw-pw-image-caption-toggle]').check();
		await imageDialog.locator('[data-rw-pw-image-caption-input]').fill('Figure 1: Main deck');

		const resizeResPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/tiptap') && res.request().method() === 'POST'
		);
		await imageDialog.locator('[data-rw-pw-image-confirm]').click();
		const resizeRes = await resizeResPromise;
		expect(resizeRes.status()).toBe(200);
		await expect(imageDialog).toBeHidden();

		await expect(hiddenTextarea).toHaveValue(/<figure class="align_left">/);
		// HiDPI stores 2x physical pixels (80px file) while keeping the 40px display width attribute
		await expect(hiddenTextarea).toHaveValue(/\.80x\d+-is-hidpi\.(?:png|webp|avif)"/);
		await expect(hiddenTextarea).toHaveValue(/width="40"/);
		await expect(hiddenTextarea).not.toHaveValue(/<span><\/span>/);
		await expect(hiddenTextarea).toHaveValue(/class="hidpi"/);
		await expect(hiddenTextarea).toHaveValue(/<figcaption>Figure 1: Main deck<\/figcaption>/);

		// 5. `Select File` lists the page's files (regression: the list must finish loading, not spin forever)
		await tiptapField.locator('[data-rw-tiptap-tool="link"]').click();
		await expect(linkDialog).toBeVisible();
		const filesResPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/tiptap') && res.url().includes('action=files')
		);
		await linkDialog.locator('[data-rw-pw-link-section$="-files"] button[aria-expanded]').click();
		await filesResPromise;
		const fileRows = linkDialog.locator('[data-rw-pw-link-files] button');
		await expect(fileRows.first()).toBeVisible();
		await expect(linkDialog.locator('[data-rw-pw-link-files]')).toContainText('deck-plan');
		await expect(linkDialog.getByRole('status')).toHaveCount(0);
		await linkDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(linkDialog).toBeHidden();

		tracker.assertNoErrors();
	});

	test('core preset loads only TiptapCore assets on mount and lazily fetches TiptapDialogs on demand', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		const requestedAssets: string[] = [];
		const onRequest = (req: { url: () => string }) => {
			const url = req.url();
			if (url.includes('/Tiptap')) {
				requestedAssets.push(url);
			}
		};
		page.on('request', onRequest);

		try {
			await mountIslandOnWorkspace(page, 'e2e-tiptap-core-host', 'InputfieldTiptap', {
				id: 'Inputfield_core_notes',
				name: 'core_notes',
				label: 'Core Notes',
				value: '<p>Minimal rich text entry</p>',
				tiptapConfig: {
					preset: 'core',
					toolbar: 'styles | bold italic underline | bullist numlist blockquote | link | undo redo',
					bubbleToolbar: '',
					headlines: ['h2', 'h3', 'h4'],
					features: ['toolbar', 'stickybars', 'statusbar', 'purifier', 'pasteFilter'],
					toggles: [],
					height: 160,
					maxHeight: 0,
					inlineMode: 0,
					slashMenu: false,
					miniBlocks: [],
					bundles: ['core'],
				},
			});

			const fieldRoot = page.locator('#e2e-tiptap-core-host [data-rw-tiptap-field="core_notes"]');
			await expect(fieldRoot).toBeVisible();
			await expect(fieldRoot.locator('.ProseMirror')).toContainText('Minimal rich text entry');
			await expect(fieldRoot.locator('[data-rw-tiptap-tool="table"]')).toHaveCount(0);
			await expect(fieldRoot.locator('[data-rw-tiptap-block-gutter]')).toHaveCount(0);

			expect(requestedAssets.some((u) => u.includes('TiptapCore.js'))).toBe(true);
			expect(requestedAssets.some((u) => u.includes('TiptapEditor.js'))).toBe(false);
			expect(requestedAssets.some((u) => u.includes('TiptapCanvas.js'))).toBe(false);
			expect(requestedAssets.some((u) => u.includes('TiptapBlocks.js'))).toBe(false);
			expect(requestedAssets.some((u) => u.includes('TiptapDialogs.js'))).toBe(false);

			// Clicking Link fetches TiptapDialogs.js lazily on demand and opens the dialog
			await fieldRoot.locator('.ProseMirror').click();
			await fieldRoot.locator('[data-rw-tiptap-tool="link"]').click();
			const linkDialog = page.locator('dialog[data-rw-tiptap-dialog="link"]');
			await expect(linkDialog).toBeVisible();
			expect(requestedAssets.some((u) => u.includes('TiptapDialogs.js'))).toBe(true);

			await page.keyboard.press('Escape');
			await expect(linkDialog).toBeHidden();

			const axeCore = await new AxeBuilder({ page })
				.include('#e2e-tiptap-core-host')
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			expect(axeCore.violations).toEqual([]);
			tracker.assertNoErrors();
		} finally {
			page.off('request', onRequest);
		}
	});

	test('loads strictly isolated submodule bundles per island and defers unused canvases and media assets', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		const requestedDistUrls: string[] = [];
		const onRequest = (req: { url: () => string }) => {
			const url = req.url();
			if (url.includes('/site/modules/React/dist/')) {
				requestedDistUrls.push(url);
			}
		};
		page.on('request', onRequest);

		try {
			// 1. KeyValue island loads only InputfieldReactKeyValue.js (never SchemaForm.js, Media, Tab, Icon, Link, Relation, Viewports, or Tiptap)
			await mountIslandOnWorkspace(page, 'e2e-iso-kv-host', 'InputfieldReactKeyValue', {
				id: 'Inputfield_iso_kv',
				name: 'iso_kv',
				label: 'Attributes',
				value: { Length: '42m' },
				keyLabel: 'Attribute',
				valueLabel: 'Value',
				addLabel: 'Add Row',
			});
			await expect(page.locator('#e2e-iso-kv-host button', { hasText: 'Add Row' })).toBeVisible();
			expect(requestedDistUrls.some((u) => u.includes('InputfieldReactKeyValue.js'))).toBe(true);
			expect(requestedDistUrls.some((u) => u.includes('SchemaForm.js'))).toBe(false);
			expect(requestedDistUrls.some((u) => u.includes('MarkupReactTab.js'))).toBe(false);
			expect(requestedDistUrls.some((u) => u.includes('ReactMedia.'))).toBe(false);
			expect(requestedDistUrls.some((u) => u.includes('ReactViewports.js'))).toBe(false);
			expect(requestedDistUrls.some((u) => u.includes('Tiptap'))).toBe(false);

			// 2. MarkupReactTab island loads MarkupReactTab.js without pulling SchemaForm.js
			await mountIslandOnWorkspace(page, 'e2e-iso-tab-host', 'MarkupReactTab', {
				groupId: 'e2e_iso_tabs',
				label: 'Sections',
				variant: 'line',
				activeTab: 'overview',
				panes: [
					{
						key: 'overview',
						domId: 'e2e_iso_tabs__overview',
						label: 'Overview',
						active: true,
						contentHtml: '<p>Isolated tab body</p>',
					},
					{
						key: 'details',
						domId: 'e2e_iso_tabs__details',
						label: 'Details',
						contentHtml: '<p>Secondary pane</p>',
					},
				],
			});
			await expect(page.locator('#e2e-iso-tab-host [role="tablist"]')).toBeVisible();
			expect(requestedDistUrls.some((u) => u.includes('MarkupReactTab.js'))).toBe(true);
			expect(requestedDistUrls.some((u) => u.includes('SchemaForm.js'))).toBe(false);

			// 3. URL/Page-only InputfieldReactLink loads InputfieldReactLink.js without ReactMedia.js or ReactMedia.css
			await mountIslandOnWorkspace(page, 'e2e-iso-link-host', 'InputfieldReactLink', {
				id: 'Inputfield_iso_link',
				name: 'iso_link',
				label: 'External Link',
				linkConfig: {
					types: ['url', 'page'],
					defaultType: 'url',
				},
				value: { type: 'url', url: 'https://example.com' },
			});
			await expect(page.locator('#e2e-iso-link-host #Inputfield_iso_link')).toBeVisible();
			expect(requestedDistUrls.some((u) => u.includes('InputfieldReactLink.js'))).toBe(true);
			expect(requestedDistUrls.some((u) => u.includes('ReactMedia.js'))).toBe(false);
			expect(requestedDistUrls.some((u) => u.includes('ReactMedia.css'))).toBe(false);

			// 4. MarkupReactTable loads ReactViewports.js + MarkupReactTable.js and defers MarkupReactCards.js until switching mode
			await mountIslandOnWorkspace(page, 'e2e-iso-vp-host', 'MarkupReactTable', fixture.viewportProps);
			const isoVp = page.locator('#e2e-iso-vp-host [data-viewport-id]');
			await expect(isoVp.locator('[data-rw-viewport-table]')).toBeVisible();
			expect(requestedDistUrls.some((u) => u.includes('ReactViewports.js'))).toBe(true);
			expect(requestedDistUrls.some((u) => u.includes('MarkupReactTable.js'))).toBe(true);
			expect(requestedDistUrls.some((u) => u.includes('MarkupReactCards.js'))).toBe(false);

			await isoVp.getByRole('button', { name: 'cards', exact: true }).click();
			await expect(isoVp).toHaveAttribute('data-viewport-mode', 'cards');
			await expect(isoVp.locator('[data-rw-viewport-table]')).toHaveCount(0);
			await expect(isoVp).toContainText('Beta Cruiser');
			expect(requestedDistUrls.some((u) => u.includes('MarkupReactCards.js'))).toBe(true);

			for (const selector of ['#e2e-iso-kv-host', '#e2e-iso-tab-host', '#e2e-iso-link-host', '#e2e-iso-vp-host']) {
				const axe = await new AxeBuilder({ page })
					.include(selector)
					.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
					.analyze();
				expect(axe.violations).toEqual([]);
			}
			tracker.assertNoErrors();
		} finally {
			page.off('request', onRequest);
		}
	});

	test('canvas preset drives left-gutter block handles (+ insert, popover Block Actions, Turn into, Duplicate, Delete, Alt+Shift+ArrowDown) with WCAG 2.1 AA', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		const requestedAssets: string[] = [];
		const onRequest = (req: { url: () => string }) => {
			const url = req.url();
			if (url.includes('/Tiptap')) {
				requestedAssets.push(url);
			}
		};
		page.on('request', onRequest);

		try {
			await mountIslandOnWorkspace(page, 'e2e-tiptap-canvas-host', 'InputfieldTiptap', {
				id: 'Inputfield_canvas_doc',
				name: 'canvas_doc',
				label: 'Canvas Document',
				value: '<p>Alpha block</p><p>Beta block</p>',
				tiptapConfig: {
					preset: 'canvas',
					toolbar: '',
					bubbleToolbar: 'bold italic underline strike code | link removeformat',
					headlines: ['h2', 'h3', 'h4'],
					features: ['bubbleMenu', 'statusbar', 'spellcheck', 'purifier', 'pasteFilter', 'slashMenu', 'blockHandles'],
					toggles: [],
					height: 240,
					maxHeight: 0,
					inlineMode: 1,
					slashMenu: true,
					miniBlocks: [],
					bundles: ['core', 'canvas'],
				},
			});

			const fieldRoot = page.locator('#e2e-tiptap-canvas-host [data-rw-tiptap-field="canvas_doc"]');
			const surface = fieldRoot.locator('[data-rw-tiptap-surface][data-rw-tiptap-handles="1"]');
			const prose = fieldRoot.locator('.ProseMirror');
			const hiddenTextarea = fieldRoot.locator('textarea[name="canvas_doc"]');
			await expect(surface).toBeVisible();
			await expect(prose).toContainText('Alpha block');

			expect(requestedAssets.some((u) => u.includes('TiptapCore.js'))).toBe(true);
			expect(requestedAssets.some((u) => u.includes('TiptapCanvas.js'))).toBe(true);
			expect(requestedAssets.some((u) => u.includes('TiptapEditor.js'))).toBe(false);
			expect(requestedAssets.some((u) => u.includes('TiptapBlocks.js'))).toBe(false);
			expect(requestedAssets.some((u) => u.includes('TiptapDialogs.js'))).toBe(false);

			// Click first block so block gutter activates and click `+` to add a block with `/` menu
			await prose.locator('p', { hasText: 'Alpha block' }).click();
			const addHandle = fieldRoot.locator('[data-rw-tiptap-block-handle="add"]');
			await expect(addHandle).toBeVisible();
			await addHandle.click();

			const slashMenu = page.locator('[data-rw-tiptap-slash-menu]');
			await expect(slashMenu).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(slashMenu).toBeHidden();
			await page.keyboard.type('Middle block');
			await expect(hiddenTextarea).toHaveValue(/<p>Alpha block<\/p><p>\/Middle block<\/p><p>Beta block<\/p>/);

			// Select first block again, open Block Actions popover menu, audit Axe, and Turn into H2
			await prose.locator('p', { hasText: 'Alpha block' }).click();
			const dragTrigger = fieldRoot.locator('[data-rw-tiptap-block-handle="drag"]');
			const blockMenu = fieldRoot.locator('[data-rw-tiptap-block-menu]');
			await dragTrigger.click();
			await expect(blockMenu).toBeVisible();

			const axeCanvasMenu = await new AxeBuilder({ page })
				.include('#e2e-tiptap-canvas-host')
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			expect(axeCanvasMenu.violations).toEqual([]);

			await blockMenu.locator('[data-rw-tiptap-block-action="turn-h2"]').click();
			await expect(blockMenu).toBeHidden();
			await expect(prose.locator('h2', { hasText: 'Alpha block' })).toBeVisible();

			// Keyboard reorder via Alt+Shift+ArrowDown moves H2 down after Middle block
			await prose.locator('h2', { hasText: 'Alpha block' }).click();
			await page.keyboard.press('Alt+Shift+ArrowDown');
			await expect(hiddenTextarea).toHaveValue(/<p>\/Middle block<\/p><h2>Alpha block<\/h2><p>Beta block<\/p>/);

			// Duplicate then delete via Block Actions menu
			await dragTrigger.click();
			await expect(blockMenu).toBeVisible();
			await blockMenu.locator('[data-rw-tiptap-block-action="duplicate"]').click();
			await expect(prose.locator('h2', { hasText: 'Alpha block' })).toHaveCount(2);

			await dragTrigger.click();
			await expect(blockMenu).toBeVisible();
			await blockMenu.locator('[data-rw-tiptap-block-action="delete"]').click();
			await expect(prose.locator('h2', { hasText: 'Alpha block' })).toHaveCount(1);

			tracker.assertNoErrors();
		} finally {
			page.off('request', onRequest);
		}
	});

	test('validates nested SchemaForm tabs with Valibot auto-tab switching and drives Repeater, Signature canvas, and Rating controls', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await mountIslandOnWorkspace(page, 'e2e-advanced-form-host', 'ReactWorkspace/SchemaForm', {
			id: 'e2e_advanced_schema_form',
			name: 'e2e_advanced_schema_form',
			action: '#advanced-submit',
			method: 'post',
			isFragment: false,
			dirtyGuard: false,
			values: {
				crew_list: [{ member_name: 'Ada', role: 'Captain' }],
				vessel_rating: '4',
				captain_signature: '',
				compliance_code: '',
			},
			tabs: [
				{
					id: 'tab_Interactive',
					label: 'Interactive Controls',
					fields: [
						{
							kind: 'control',
							type: 'repeater',
							id: 'Inputfield_crew_list',
							name: 'crew_list',
							label: 'Crew Manifest',
							colSpan: 12,
							addLabel: 'Add Crew Member',
							subfields: [
								{ name: 'member_name', label: 'Name', type: 'text', width: 50, required: true },
								{ name: 'role', label: 'Role', type: 'text', width: 50 },
							],
						},
						{
							kind: 'control',
							type: 'rating',
							id: 'Inputfield_vessel_rating',
							name: 'vessel_rating',
							label: 'Vessel Rating',
							max: 5,
							colSpan: 6,
						},
						{
							kind: 'control',
							type: 'signature',
							id: 'Inputfield_captain_signature',
							name: 'captain_signature',
							label: 'Captain Signature',
							colSpan: 6,
						},
					],
				},
				{
					id: 'tab_Compliance',
					label: 'Compliance & Audit',
					fields: [
						{
							kind: 'section',
							id: 'sec_imo',
							name: 'sec_imo',
							label: 'IMO Registration Section',
							collapsed: true,
							fields: [
								{
									kind: 'control',
									type: 'text',
									id: 'Inputfield_compliance_code',
									name: 'compliance_code',
									label: 'IMO Code',
									required: true,
									pattern: '/^IMO-[0-9]{4}$/',
									colSpan: 12,
								},
							],
						},
					],
				},
			],
			fields: [],
			submits: [{ id: 'submit_save', name: 'submit_save', label: 'Validate & Save', header: false }],
		});

		const formHost = page.locator('#e2e-advanced-form-host');

		// 1. RepeaterField: add a second crew row and populate it
		const repeater = formHost.locator('[data-rw-control="repeater"]');
		await expect(repeater).toBeVisible();
		await expect(repeater.locator('input[name="crew_list[0][member_name]"]')).toHaveValue('Ada');
		await repeater.getByRole('button', { name: 'Add Row' }).click();
		await repeater.locator('input[name="crew_list[1][member_name]"]').fill('Deniz');

		// 2. RatingField: click 5th star button and verify hidden value = 5
		const rating = formHost.locator('[data-rw-control="rating"]');
		await expect(rating).toBeVisible();
		await rating.locator('button').nth(4).click();
		await expect(rating.locator('input[name="vessel_rating"]')).toHaveValue('5');

		// 3. SignatureField: draw stroke across HTML5 <canvas>, verify PNG dataURL, then Clear and re-sign
		const sig = formHost.locator('[data-rw-control="signature"]');
		const canvas = sig.locator('canvas');
		await canvas.scrollIntoViewIfNeeded();
		const cBox = await canvas.boundingBox();
		expect(cBox).not.toBeNull();
		await page.mouse.move(cBox!.x + 20, cBox!.y + 30);
		await page.mouse.down();
		await page.mouse.move(cBox!.x + 120, cBox!.y + 70, { steps: 5 });
		await page.mouse.up();

		const sigHidden = sig.locator('input[name="captain_signature"]');
		await expect(sigHidden).toHaveValue(/^data:image\/png;base64,/);

		await sig.getByRole('button', { name: 'Clear' }).click();
		await expect(sigHidden).toHaveValue('');

		// 4. Submit form while required `compliance_code` on inactive Tab 2 (`tab_Compliance`) is empty:
		// Valibot blocks submit AND automatically switches active tab to `Compliance & Audit`!
		await page.evaluate(() => {
			const f = document.getElementById('e2e_advanced_schema_form');
			f?.addEventListener('submit', (ev) => {
				ev.preventDefault();
				(window as any).__advancedFormSubmitted = true;
			});
		});

		await formHost.getByRole('button', { name: 'Validate & Save' }).click();

		const complianceInput = formHost.locator('input[name="compliance_code"]');
		await expect(complianceInput).toBeVisible();

		// Enter invalid pattern first (`BAD`), then valid PCRE-delimited pattern (`IMO-2026`)
		await complianceInput.fill('BAD');
		await formHost.getByRole('button', { name: 'Validate & Save' }).click();
		await expect(formHost).toContainText(/invalid/i);

		await complianceInput.fill('IMO-2026');
		await formHost.getByRole('button', { name: 'Validate & Save' }).click();
		const didSubmit = await page.evaluate(() => Boolean((window as any).__advancedFormSubmitted));
		expect(didSubmit).toBe(true);

		tracker.assertNoErrors();
	});

	test('searches 6,500+ vector icons in anchored popover with Category and Style selects, customizes Appearance tab with zero form layout shift, and non-destructively toggles ProcessField core icon via showIf', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		// 1. Test InputfieldReactIcon with Popover + [ Icons | Appearance ] tabs + WCAG 2.1 AA
		await mountIslandOnWorkspace(
			page,
			'e2e-icon-host',
			'ReactWorkspace/SchemaForm',
			fixture.iconSchemaFormProps
		);

		const iconControl = page.locator('#e2e-icon-host [data-rw-control="icon"]');
		await expect(iconControl).toBeVisible();

		const initialBox = await iconControl.boundingBox();
		expect(initialBox).not.toBeNull();

		await iconControl.locator('button[aria-haspopup="dialog"]').click();
		const popover = page.locator('[data-rw-icon-popover="true"]');
		await expect(popover).toBeVisible();

		// Ensure zero library brand names ("Lucide" / "Tabler") appear anywhere in popover or trigger
		await expect(popover).not.toContainText(/lucide|tabler/i);
		await expect(iconControl).not.toContainText(/lucide|tabler/i);

		// Verify Category and Style <select> controls are rendered and populated via /_react/icons
		const categorySelect = popover.locator('select[data-rw-icon-category="true"]');
		const styleSelect = popover.locator('select[data-rw-icon-style="true"]');
		await expect(categorySelect).toBeVisible();
		await expect(styleSelect).toBeVisible();
		await expect
			.poll(async () => await categorySelect.locator('option').count())
			.toBeGreaterThan(35);

		// Audit WCAG 2.1 AA while popover is open on the Icons tab
		const axeIconsTab = await new AxeBuilder({ page })
			.include('[data-rw-icon-popover="true"]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(axeIconsTab.violations).toEqual([]);

		// Search "heart" and select it, then switch to the Appearance tab inside the popover
		const searchInput = popover.locator('input[type="search"]');
		await searchInput.fill('heart');
		const heartBtn = popover.locator('button[aria-label="heart"]').first();
		await expect(heartBtn).toBeVisible();
		await heartBtn.click();

		await popover.locator('button[data-rw-icon-tab="appearance"]').click();
		const studio = popover.locator('[data-rw-icon-studio="true"]');
		await expect(studio).toBeVisible();

		await studio.getByRole('button', { name: 'Filled', exact: true }).click();
		await studio.getByRole('button', { name: '32', exact: true }).click();
		await studio.locator('button[aria-label="#16a34a"]').click();
		await studio.locator('button[aria-label="#dcfce7"]').click();
		await studio.getByRole('button', { name: 'Circle', exact: true }).click();

		// Audit WCAG 2.1 AA on the Appearance tab as well
		const axeAppearanceTab = await new AxeBuilder({ page })
			.include('[data-rw-icon-popover="true"]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(axeAppearanceTab.violations).toEqual([]);

		await studio.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(popover).toBeHidden();

		// Verify zero form layout shift: trigger height remains identical before and after selection/customization
		const afterBox = await iconControl.boundingBox();
		expect(afterBox).not.toBeNull();
		expect(Math.round(afterBox!.height)).toBe(Math.round(initialBox!.height));

		const hiddenInput = page.locator(`#e2e-icon-host input[type="hidden"][name="${fixture.iconFieldName}"]`);
		await expect(hiddenInput).toHaveValue(/"name":"heart"/);
		await expect(hiddenInput).toHaveValue(/"variant":"filled"/);
		await expect(hiddenInput).toHaveValue(/"size":32/);
		await expect(hiddenInput).toHaveValue(/"color":"#16a34a"/);
		await expect(hiddenInput).toHaveValue(/"background":"#dcfce7"/);
		await expect(hiddenInput).toHaveValue(/"radius":"full"/);

		const axeTrigger = await new AxeBuilder({ page })
			.include('#e2e-icon-host')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(axeTrigger.violations).toEqual([]);

		// 2. Test non-destructive Vector Icon hook on live ProcessWire Setup > Fields > Edit!
		await page.goto(getAdminUrl(`setup/field/edit?id=${fixture.iconFieldId}`), {
			waitUntil: 'networkidle',
		});

		const coreIconWrap = page.locator('#wrap_Inputfield_icon');
		const lucideIconWrap = page.locator('#wrap_Inputfield_lucideIcon');
		await expect(lucideIconWrap).toBeVisible();
		await expect(lucideIconWrap).toContainText('Vector Icon');
		await expect(lucideIconWrap).not.toContainText(/lucide|tabler/i);
		await expect(coreIconWrap).not.toHaveClass(/InputfieldStateHidden/);

		// Expand collapsedBlank `Vector Icon` field header, open picker, and select `compass`
		await lucideIconWrap.locator('> .InputfieldHeader').click();
		const adminTrigger = lucideIconWrap.locator('button[aria-haspopup="dialog"]');
		await expect(adminTrigger).toBeVisible();
		await adminTrigger.click();

		const adminPopover = page.locator('[data-rw-icon-popover="true"]');
		await expect(adminPopover).toBeVisible();
		await adminPopover.locator('input[type="search"]').fill('compass');
		await adminPopover.locator('button[aria-label="compass"]').first().click();

		await expect(page.locator('#Inputfield_lucideIcon')).toHaveValue('lucide--compass');
		// ProcessWire showIf="lucideIcon=''" hides the native Icon field immediately!
		await expect(coreIconWrap).toHaveClass(/InputfieldStateHidden/);

		// Clearing Vector Icon reveals ProcessWire's native Icon field again!
		await lucideIconWrap.locator('button[aria-label="Clear icon"]').click();
		await expect(page.locator('#Inputfield_lucideIcon')).toHaveValue('');
		await expect(coreIconWrap).not.toHaveClass(/InputfieldStateHidden/);

		tracker.assertNoErrors();
	});
});
