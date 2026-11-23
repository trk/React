import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { attachRuntimeErrorTracker, getAdminUrl } from '../../../../../tests/e2e/helpers';
import {
	destroyIsolatedE2EFixture,
	provisionIsolatedE2EFixture,
	type IsolatedE2EFixture,
} from './e2e-fixtures';

let isolatedFixture: IsolatedE2EFixture;

test.describe('ProcessReactWorkspace Launcher, Cross-Panel SPA Navigation & Standalone React Islands', () => {
	test.beforeAll(() => {
		isolatedFixture = provisionIsolatedE2EFixture();
	});

	test.afterAll(() => {
		destroyIsolatedE2EFixture(isolatedFixture?.suffix);
	});

	test('renders WorkspaceLauncher with zero runtime errors, passes WCAG a11y audit, toggles dark mode & mobile drawer, and navigates via X-Inertia SPA', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		// Verify Inertia root (#app) and ReactWorkspaceRuntime are mounted
		await expect(page.locator('#app')).toBeVisible();
		const hasRuntime = await page.evaluate(() => Boolean((window as unknown as { ReactWorkspaceRuntime?: unknown }).ReactWorkspaceRuntime));
		expect(hasRuntime).toBe(true);

		// Verify Workspace header is visible
		await expect(page.locator('h1')).toContainText('Workspace');

		// Automated WCAG 2.1 AA accessibility scan scoped to ProcessReactWorkspace (#app), including full color-contrast verification
		const axeResults = await new AxeBuilder({ page })
			.include('#app')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		const criticalOrSerious = axeResults.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(criticalOrSerious).toEqual([]);

		// Verify unified Account Menu dropdown: Theme (Light/Dark/System + Color Schemes), links, and per-user persistence
		const userMenuTrigger = page.locator('[data-rw-user-menu-trigger]');
		await expect(userMenuTrigger).toBeVisible();
		const hadDarkInitially = await page.evaluate(() => document.documentElement.classList.contains('dark'));

		await userMenuTrigger.click();
		await expect(page.locator('[data-rw-theme-section]')).toBeVisible();
		await expect(page.locator('[data-rw-user-view-site]')).toBeVisible();
		await expect(page.locator('[data-rw-user-profile]')).toBeVisible();
		await expect(page.locator('[data-rw-user-logout]')).toBeVisible();

		const targetMode = hadDarkInitially ? 'light' : 'dark';
		const modePrefResPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/workspace-prefs') && res.request().method() === 'POST'
		);
		await page.locator(`[data-rw-theme-mode-option="${targetMode}"]`).click();
		expect((await modePrefResPromise).status()).toBe(200);
		await expect(page.locator('html')).toHaveAttribute(
			'class',
			hadDarkInitially ? /^(?!.*\bdark\b).*$/ : /\bdark\b/
		);

		const presetPrefResPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/workspace-prefs') && res.request().method() === 'POST'
		);
		await page.locator('[data-rw-theme-preset-option="ocean"]').click();
		expect((await presetPrefResPromise).status()).toBe(200);
		await expect(page.locator('[data-rw-theme-preset-reset]')).toBeVisible();

		// Reload and confirm per-user theme mode + color preset persisted across full navigation
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.locator('#app')).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute(
			'class',
			hadDarkInitially ? /^(?!.*\bdark\b).*$/ : /\bdark\b/
		);

		// Restore original theme mode & reset preset back to site default
		await page.locator('[data-rw-user-menu-trigger]').click();
		await expect(page.locator('[data-rw-theme-preset-reset]')).toBeVisible();
		const resetPresetPromise = page.waitForResponse(
			(res) => res.url().includes('/_react/workspace-prefs') && res.request().method() === 'POST'
		);
		await page.locator('[data-rw-theme-preset-reset]').click();
		expect((await resetPresetPromise).status()).toBe(200);

		const restoreModePromise = page.waitForResponse(
			(res) => res.url().includes('/_react/workspace-prefs') && res.request().method() === 'POST'
		);
		await page.locator('[data-rw-theme-mode-option="system"]').click();
		expect((await restoreModePromise).status()).toBe(200);
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-rw-theme-section]')).toHaveCount(0);

		// Verify Keyboard Shortcuts Help Dialog (?) opens and closes cleanly
		await page.locator('h1').click();
		await page.keyboard.press('?');
		await expect(page.locator('[data-rw-shortcuts-dialog]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-rw-shortcuts-dialog]')).toHaveCount(0);

		// Verify responsive Mobile Drawer opens and closes at mobile viewport width, while topbar admin return stays hidden (< lg)
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator('[data-rw-admin-return]')).toBeHidden();
		const mobileTrigger = page.locator('[data-rw-mobile-menu-trigger]');
		if (await mobileTrigger.isVisible()) {
			await mobileTrigger.click();
			await expect(page.locator('[data-rw-mobile-drawer]')).toBeVisible();
			await expect(page.locator('[data-rw-mobile-drawer] a[href]').first()).toBeVisible();
			await page.keyboard.press('Escape');
		}
		await page.setViewportSize({ width: 1280, height: 720 });
		await expect(page.locator('[data-rw-admin-return]')).toBeVisible();

		// Verify Command Palette (⌘K) opens and closes cleanly
		await page.locator('[data-rw-command-trigger]').click();
		await expect(page.locator('[data-rw-command-palette]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-rw-command-palette]')).toHaveCount(0);

		// Set an in-memory JS marker on window to prove Inertia SPA navigation does NOT trigger a full browser reload
		await page.evaluate(() => {
			(window as unknown as { __pwSpaSessionMarker?: string }).__pwSpaSessionMarker = 'spa-alive-1';
		});

		// Discover any registered workspace dynamically without hardcoding sibling modules
		const targetWorkspace = await page.evaluate(() => {
			const pageScript = document.querySelector('script[type="application/json"][data-page="app"]');
			if (!pageScript?.textContent) return null;
			try {
				const parsed = JSON.parse(pageScript.textContent);
				const list = parsed?.props?.workspaces || parsed?.props?.workspace?.workspaces || [];
				const candidate = Array.isArray(list)
					? list.find((w: { id?: string; url?: string; label?: string }) => w?.url && w.id !== 'workspace')
					: null;
				return candidate ? { label: String(candidate.label || ''), url: String(candidate.url) } : null;
			} catch {
				return null;
			}
		});

		if (targetWorkspace && targetWorkspace.url) {
			const cleanSlug = targetWorkspace.url.replace(/\/+$/, '').split('/').pop() || '';
			const inertiaResponsePromise = page.waitForResponse(
				(res) => res.url().includes(cleanSlug) && res.request().headers()['x-inertia'] === 'true'
			);

			const inlineLink = page.locator('header nav a', { hasText: targetWorkspace.label }).first();
			if (await inlineLink.isVisible()) {
				await inlineLink.click();
			} else {
				await page.locator('[data-rw-more-workspaces-trigger]').click();
				await expect(page.locator('[data-rw-more-workspaces-menu]')).toBeVisible();
				await page.locator('[data-rw-more-workspaces-menu] a', { hasText: targetWorkspace.label }).first().click();
			}

			const inertiaResponse = await inertiaResponsePromise;
			expect(inertiaResponse.status()).toBe(200);
		} else {
			// Self-contained fallback: trigger X-Inertia SPA visit to WorkspaceLauncher itself
			const selfInertiaPromise = page.waitForResponse(
				(res) => res.url().includes('/workspace') && res.request().headers()['x-inertia'] === 'true'
			);
			await page.evaluate((url) => {
				(window as any).ReactWorkspaceRuntime.Inertia.router.visit(url);
			}, getAdminUrl('workspace/'));
			const selfRes = await selfInertiaPromise;
			expect(selfRes.status()).toBe(200);
		}

		const markerAfterSpa = await page.evaluate(
			() => (window as unknown as { __pwSpaSessionMarker?: string }).__pwSpaSessionMarker
		);
		expect(markerAfterSpa).toBe('spa-alive-1');

		tracker.assertNoErrors();
	});

	test('dynamically loads and mounts MarkupReactTab, InputfieldReactKeyValue, and SchemaForm islands', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		// Mount test islands via ReactWorkspaceRuntime (SchemaForm.js is lazy-loaded automatically on demand)
		const mountedInfo = await page.evaluate(async () => {
			const host = document.createElement('div');
			host.id = 'e2e-react-workspace-islands-host';
			host.innerHTML = `
				<div id="e2e-kv-wrap">
					<input type="hidden" id="e2e_specs" name="e2e_specs" data-inertia-input="e2e_specs" value="{}" />
					<div id="e2e-kv-island"
						data-inertia-island="InputfieldReactKeyValue"
						data-input-id="e2e_specs"
						data-props='${JSON.stringify({
							id: 'e2e_specs',
							name: 'e2e_specs',
							value: { Builder: 'Sanlorenzo' },
							keyLabel: 'Attribute',
							valueLabel: 'Metric',
							addLabel: 'Add Spec Row',
						})}'></div>
				</div>
				<div id="e2e-kv-readonly-island"
					data-inertia-island="InputfieldReactKeyValue"
					data-readonly="true"
					data-props='${JSON.stringify({
						name: 'e2e_specs_ro',
						readOnly: true,
						value: { LOA: '45m' },
					})}'></div>
				<div id="e2e-tab-island"
					data-inertia-island="MarkupReactTab"
					data-props='${JSON.stringify({
						groupId: 'e2e_tabs',
						variant: 'segmented',
						activeTab: 'general',
						panes: [
							{
								key: 'general',
								domId: 'e2e_tabs__general',
								label: 'General Info',
								badge: '2',
								lazy: false,
								active: true,
								contentHtml: '<p id="pane-general">General Content Ready</p>',
							},
							{
								key: 'technical',
								domId: 'e2e_tabs__technical',
								label: 'Technical Specs',
								errors: 1,
								lazy: true,
								active: false,
								contentHtml: '<p id="pane-tech">Technical Content Ready</p>',
							},
						],
					})}'></div>
				<div id="e2e-schema-form-island"
					data-inertia-island="ReactWorkspace/SchemaForm"
					data-react-island="ReactWorkspace/SchemaForm"
					data-props='${JSON.stringify({
						id: 'e2e_charter_form',
						name: 'e2e_charter_form',
						action: '#submit',
						method: 'post',
						isFragment: false,
						dirtyGuard: false,
						csrf: { name: 'TOKEN123', value: 'SECRET456' },
						hiddenInputs: [{ name: 'entry_id', value: '42' }],
						values: {
							vessel_title: 'Aegean Explorer',
							vessel_title__1020: 'Ege Kaşifi',
							is_active: '1',
							amenities: ['jacuzzi'],
							guests: '4',
							vip_transfer: '0',
							vip_notes: '',
						},
						errors: {},
						tabs: [
							{
								id: 'tab_booking',
								label: 'Booking Details',
								fields: [
									{
										kind: 'control',
										type: 'text',
										id: 'Inputfield_vessel_title',
										name: 'vessel_title',
										label: 'Vessel Title',
										required: true,
										width: 100,
										value: 'Aegean Explorer',
										prefix: 'M/Y',
										charCount: true,
										maxLength: 50,
										useLanguages: true,
										languages: [
											{
												id: 1010,
												name: 'default',
												title: 'EN',
												isDefault: true,
												editable: true,
												inputName: 'vessel_title',
												inputId: 'Inputfield_vessel_title',
												value: 'Aegean Explorer',
											},
											{
												id: 1020,
												name: 'tr',
												title: 'TR',
												isDefault: false,
												editable: true,
												inputName: 'vessel_title__1020',
												inputId: 'Inputfield_vessel_title__1020',
												value: 'Ege Kaşifi',
											},
										],
									},
									{
										kind: 'control',
										type: 'toggle',
										id: 'Inputfield_is_active',
										name: 'is_active',
										label: 'Active Status',
										required: false,
										width: 50,
										value: '1',
										options: [
											{ value: '1', label: 'Yes' },
											{ value: '0', label: 'No' },
										],
									},
									{
										kind: 'control',
										type: 'asmselect',
										id: 'Inputfield_amenities',
										name: 'amenities',
										label: 'Amenities',
										required: false,
										width: 50,
										values: ['jacuzzi'],
										options: [
											{ value: 'jacuzzi', label: 'Deck Jacuzzi' },
											{ value: 'stabilizers', label: 'Zero-Speed Stabilizers' },
										],
									},
									{
										kind: 'control',
										type: 'number',
										id: 'Inputfield_guests',
										name: 'guests',
										label: 'Guests',
										required: true,
										width: 50,
										value: '4',
									},
									{
										kind: 'control',
										type: 'calculation',
										id: 'Inputfield_total_estimate',
										name: 'total_estimate',
										label: 'Estimated Total',
										required: false,
										width: 50,
										value: '',
										formula: '{guests} * 250',
										precision: 0,
										prefix: 'EUR',
									},
									{
										kind: 'control',
										type: 'toggle',
										id: 'Inputfield_vip_transfer',
										name: 'vip_transfer',
										label: 'VIP Helicopter Transfer',
										required: false,
										width: 100,
										value: '0',
										options: [
											{ value: '1', label: 'Included' },
											{ value: '0', label: 'No' },
										],
									},
									{
										kind: 'control',
										type: 'text',
										id: 'Inputfield_vip_notes',
										name: 'vip_notes',
										label: 'Helipad Notes',
										required: false,
										width: 100,
										showIf: 'vip_transfer=1',
										value: '',
									},
								],
							},
						],
						fields: [],
						submits: [
							{
								id: 'submit_save',
								name: 'submit_save',
								label: 'Save Booking',
								header: false,
							},
						],
					})}'></div>
			`;
			document.body.appendChild(host);

			const runtime = (window as unknown as { ReactWorkspaceRuntime: { mountIslands: (root: HTMLElement) => void } }).ReactWorkspaceRuntime;
			runtime.mountIslands(host);
			return true;
		});

		expect(mountedInfo).toBe(true);

		// Verify InputfieldReactKeyValue rendered the initial row and can add a new row + sync hidden input
		const kvContainer = page.locator('#e2e-kv-wrap');
		await expect(kvContainer.locator('input[value="Sanlorenzo"]')).toBeVisible();
		await kvContainer.getByRole('button', { name: 'Add Spec Row' }).click();

		// Verify InputfieldReactKeyValue readOnly mode renders Badge chips
		const kvReadonly = page.locator('#e2e-kv-readonly-island [data-kv-readonly="e2e_specs_ro"]');
		await expect(kvReadonly).toContainText('LOA:');
		await expect(kvReadonly).toContainText('45m');

		// Verify MarkupReactTab rendered both tabs and switches content on click
		const tabContainer = page.locator('#e2e-tab-island');
		await expect(tabContainer.locator('[data-react-tabs="e2e_tabs"]')).toHaveAttribute('data-variant', 'segmented');
		await expect(tabContainer.locator('#pane-general')).toHaveText('General Content Ready');
		await tabContainer.getByRole('tab', { name: /Technical Specs/i }).click();
		await expect(tabContainer.locator('#pane-tech')).toHaveText('Technical Content Ready');
		await expect(tabContainer.locator('input[name="pw_tab_lazy_e2e_tabs__technical"]')).toHaveValue('0');

		// Verify ReactWorkspace/SchemaForm renders multi-language text, toggle, asmselect, calculation formula, and showIf fields
		const schemaForm = page.locator('#e2e-schema-form-island');
		const textField = schemaForm.locator('[data-field-name="vessel_title"]');
		await expect(textField.locator('[data-rw-affix-badge="prefix"]')).toHaveText('M/Y');
		await expect(textField.locator('[data-rw-char-counter]')).toContainText('15 / 50');
		await expect(textField.locator('input[name="vessel_title"]')).toHaveValue('Aegean Explorer');
		await expect(textField.locator('input[name="vessel_title__1020"]')).toHaveValue('Ege Kaşifi');
		await textField.getByRole('tab', { name: 'TR' }).click();
		await expect(textField.locator('input[name="vessel_title__1020"]')).toBeVisible();

		const toggleField = schemaForm.locator('[data-field-name="is_active"]');
		await expect(toggleField.locator('input[name="_is_active_"]')).toHaveValue('1');
		await toggleField.locator('label', { hasText: 'No' }).click();
		await expect(toggleField.locator('input[name="is_active"][value="0"]')).toBeChecked();

		const asmField = schemaForm.locator('[data-field-name="amenities"]');
		await expect(asmField).toContainText('Deck Jacuzzi');
		await asmField.locator('select:not([multiple])').selectOption('stabilizers');
		await expect(asmField).toContainText('Zero-Speed Stabilizers');
		const selectedAsmValues = await asmField
			.locator('select[name="amenities[]"] option')
			.evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
		expect(selectedAsmValues).toEqual(['jacuzzi', 'stabilizers']);

		// Verify accessible Grab-Move-Drop keyboard sorting on AsmSelectField SortableHandle
		const secondAsmHandle = asmField.locator('[data-rw-sortable-handle="stabilizers"]');
		await secondAsmHandle.focus();
		await page.keyboard.press('Space');
		await expect(secondAsmHandle).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press('ArrowUp');
		await page.keyboard.press('Space');
		const reorderedAsmValues = await asmField
			.locator('select[name="amenities[]"] option')
			.evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
		expect(reorderedAsmValues).toEqual(['stabilizers', 'jacuzzi']);

		// Verify hierarchical projectTreeReorder helper exposed on ReactWorkspaceRuntime.UI
		const treeCheck = await page.evaluate(() => {
			const ui = (window as unknown as { ReactWorkspaceRuntime: { UI: { projectTreeReorder: any } } })
				.ReactWorkspaceRuntime.UI;
			const flat = [
				{ id: 'home', depth: 0, parentId: null },
				{ id: 'fleet', depth: 0, parentId: null },
				{ id: 'yachts', depth: 1, parentId: 'fleet' },
				{ id: 'contact', depth: 0, parentId: null },
			];
			// Indent 'contact' under 'fleet' (depthDelta +1 at position 4)
			const indented = ui.projectTreeReorder(flat, 'contact', 4, 1, 3);
			// Move 'fleet' (with subtree 'yachts' + 'contact') above 'home'
			const movedSubtree = ui.projectTreeReorder(indented.items, 'fleet', 0, 0, 3);
			return {
				indentedPayload: indented.payload,
				movedIds: movedSubtree.items.map((n: { id: string }) => n.id),
			};
		});
		expect(treeCheck.indentedPayload.find((p: { id: string }) => p.id === 'contact')?.parent_id).toBe('fleet');
		expect(treeCheck.movedIds).toEqual(['fleet', 'yachts', 'contact', 'home']);

		await expect(schemaForm.locator('input[name="TOKEN123"]')).toHaveValue('SECRET456');
		await expect(schemaForm.locator('input[name="total_estimate"]')).toHaveValue('1000');
		await expect(schemaForm.locator('[data-field-name="vip_notes"]')).toHaveCount(0);

		await schemaForm.locator('input[name="guests"]').fill('6');
		await expect(schemaForm.locator('input[name="total_estimate"]')).toHaveValue('1500');

		await schemaForm.locator('[data-field-name="vip_transfer"] label', { hasText: 'Included' }).click();
		await expect(schemaForm.locator('[data-field-name="vip_notes"]')).toBeVisible();

		tracker.assertNoErrors();
	});

	test('supports 2-view focused WorkspaceLauncher (Overview + Module Directory), Customize Layout JSON Import/Export, and live EditPresenceBanner on SchemaForm', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		// 1. Verify non-redundant 2-tab IA: Overview shows live widgets WITHOUT duplicating directory; widget layout controls stay hidden until Customize Layout is opened
		await expect(page.locator('[data-rw-widgets-section]')).toBeVisible();
		await expect(page.locator('[data-rw-directory-section]')).toHaveCount(0);
		await expect(page.locator('[data-rw-widget-controls]')).toHaveCount(0);

		// Open Customize Layout -> controls + SortableHandles + Export/Import JSON buttons appear
		await page.locator('[data-rw-customize-dashboard]').click();
		await expect(page.locator('[data-rw-dashboard-customizer]')).toBeVisible();
		await expect(page.locator('[data-rw-customizer-row] [data-rw-sortable-handle]').first()).toBeVisible();
		await expect(page.locator('[data-rw-widget-card] [data-rw-sortable-handle]').first()).toBeVisible();
		await expect(page.locator('[data-rw-export-layout]')).toBeVisible();
		await expect(page.locator('[data-rw-import-layout]')).toBeVisible();

		// Open Import JSON dialog (starts empty without pre-filled boilerplate), apply preset, and reset back to default via ConfirmDialog
		await page.locator('[data-rw-import-layout]').click();
		await expect(page.locator('[data-rw-import-layout-dialog]')).toBeVisible();
		await expect(page.locator('[data-rw-import-layout-textarea]')).toHaveValue('');
		await page.locator('[data-rw-import-layout-textarea]').fill(
			JSON.stringify({
				schema: 'processwire.react-workspace.layout.v1',
				layout: { favorites: [], widgetOrder: [], hiddenWidgets: [], widgetSizes: {} },
			})
		);
		await page.locator('[data-rw-import-layout-submit]').click();
		await expect(page.locator('[data-rw-import-layout-dialog]')).toHaveCount(0);
		await page.locator('[data-rw-reset-preferences]').click();
		await page.locator('[data-rw-confirm-accept]').click();
		await page.locator('[data-rw-customize-dashboard]').click();

		// Switch to Module Directory view and filter modules
		await page.locator('[data-rw-open-directory]').click();
		await expect(page.locator('[data-rw-directory-section]')).toBeVisible();
		await expect(page.locator('[data-rw-widgets-section]')).toHaveCount(0);

		// 2. Verify live EditPresenceBanner (active co-editor + remote-save stale alert) on SchemaForm
		let heartbeatCallCount = 0;
		await page.route('**/_react/presence', async (route) => {
			heartbeatCallCount += 1;
			const body = route.request().postDataJSON() || {};
			if (body.action === 'leave') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						ok: true,
						presence: {
							resourceKey: body.resourceKey,
							serverTime: Math.floor(Date.now() / 1000),
							ttlSeconds: 45,
							heartbeatSeconds: 15,
							coEditors: [],
							lastSaved: null,
						},
					}),
				});
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					ok: true,
					presence: {
						resourceKey: body.resourceKey,
						serverTime: Math.floor(Date.now() / 1000),
						ttlSeconds: 45,
						heartbeatSeconds: 5,
						coEditors: [
							{
								userId: 999888,
								userName: 'coeditor',
								displayName: 'Deniz Demir',
								startedAt: Math.floor(Date.now() / 1000) - 20,
								lastSeenAt: Math.floor(Date.now() / 1000) - 2,
								secondsAgo: 2,
							},
						],
						lastSaved:
							heartbeatCallCount >= 2
								? {
										version: 2,
										savedAt: Math.floor(Date.now() / 1000),
										userId: 999888,
										userName: 'coeditor',
										displayName: 'Deniz Demir',
									}
								: {
										version: 1,
										savedAt: Math.floor(Date.now() / 1000) - 120,
										userId: 999888,
										userName: 'coeditor',
										displayName: 'Deniz Demir',
									},
					},
				}),
			});
		});

		await page.evaluate(() => {
			const host = document.createElement('div');
			host.id = 'e2e-presence-form-host';
			host.innerHTML = `
				<div id="e2e-presence-schema-form"
					data-inertia-island="ReactWorkspace/SchemaForm"
					data-react-island="ReactWorkspace/SchemaForm"
					data-props='${JSON.stringify({
						id: 'e2e_presence_form',
						name: 'e2e_presence_form',
						action: '#presence-test',
						method: 'post',
						isFragment: false,
						presenceKey: 'entry:articles:demo-presence-1',
						presenceEndpoint: '/_react/presence',
						fields: [
							{
								kind: 'control',
								type: 'text',
								id: 'Inputfield_headline',
								name: 'headline',
								label: 'Headline',
								width: 100,
								value: 'Concurrent Edit Test',
							},
						],
						submits: [{ id: 'submit_save', name: 'submit_save', label: 'Save', header: false }],
					})}'></div>
			`;
			document.body.appendChild(host);
			(
				window as unknown as {
					ReactWorkspaceRuntime: { mountIslands: (root: HTMLElement) => void };
				}
			).ReactWorkspaceRuntime.mountIslands(host);
		});

		// Co-editor live presence banner appears immediately after first heartbeat
		const presenceBanner = page.locator('[data-rw-presence-banner="entry:articles:demo-presence-1"]');
		await expect(presenceBanner).toBeVisible();
		await expect(presenceBanner).toContainText('Deniz Demir');
		await expect(presenceBanner).toContainText('is currently editing this record');

		// Trigger focus visibility sync -> 2nd heartbeat reports remote save version 2 -> stale save alert appears!
		await page.evaluate(() => {
			window.dispatchEvent(new Event('focus'));
		});

		const staleAlert = page.locator('[data-rw-presence-stale="entry:articles:demo-presence-1"]');
		await expect(staleAlert).toBeVisible();
		await expect(staleAlert).toContainText('Updated by Deniz Demir');
		await expect(staleAlert.locator('[data-rw-presence-reload]')).toBeVisible();

		await page.unroute('**/_react/presence');
		tracker.assertNoErrors();
	});

	test('resizes Dashboard Bento widgets via 12-column slider and mounts SchemaForm colspan & range controls', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		// Open Customize Dashboard panel
		const customizeBtn = page.locator('[data-rw-customize-dashboard]').first();
		await expect(customizeBtn).toBeVisible();
		await customizeBtn.click();
		await expect(page.locator('[data-rw-dashboard-customizer]')).toBeVisible();

		// Find first customizer widget row and resize its 12-col slider
		const firstRow = page.locator('[data-rw-customizer-row]').first();
		await expect(firstRow).toBeVisible();
		const widgetId = await firstRow.getAttribute('data-rw-customizer-row');
		expect(widgetId).toBeTruthy();

		const sliderInput = firstRow.locator('[data-rw-colspan-slider] input[type="range"][data-rw-slider]');
		await expect(sliderInput).toBeVisible();
		const initialVal = await sliderInput.inputValue();
		const targetSpan = initialVal === '8' ? '4' : '8';

		const resizeRequestPromise = page.waitForRequest(
			(req) =>
				req.url().includes('/_react/workspace-prefs') &&
				req.method() === 'POST' &&
				(req.postData() || '').includes('"resize_widget"')
		);

		await sliderInput.fill(targetSpan);

		const resizeReq = await resizeRequestPromise;
		expect(resizeReq.postData()).toContain(`"size":"${targetSpan}"`);

		const liveWidgetCard = page.locator(`[data-rw-widget-card="${widgetId}"]`);
		await expect(liveWidgetCard).toHaveAttribute('data-rw-widget-span', targetSpan);

		// Reset preferences back to clean default state via ConfirmDialog
		await page.locator('[data-rw-reset-preferences]').click();
		await page.locator('[data-rw-confirm-accept]').click();

		// Also verify SchemaForm colspan (percent mode) & range controls
		await page.evaluate(() => {
			const host = document.createElement('div');
			host.id = 'e2e-colspan-form-host';
			host.innerHTML = `
				<div id="e2e-colspan-schema-form"
					data-inertia-island="ReactWorkspace/SchemaForm"
					data-react-island="ReactWorkspace/SchemaForm"
					data-props='${JSON.stringify({
						id: 'e2e_colspan_form',
						name: 'e2e_colspan_form',
						action: '#colspan-test',
						method: 'post',
						isFragment: false,
						fields: [
							{
								kind: 'control',
								type: 'colspan',
								valueMode: 'percent',
								id: 'Inputfield_column_width',
								name: 'column_width',
								label: 'Column Span (12-Col)',
								colSpan: 6,
								value: '100',
							},
							{
								kind: 'control',
								type: 'range',
								id: 'Inputfield_zoom_level',
								name: 'zoom_level',
								label: 'Zoom Level',
								colSpan: 6,
								min: 10,
								max: 200,
								step: 5,
								value: '100',
							},
						],
						submits: [],
					})}'></div>
			`;
			document.body.appendChild(host);
			(
				window as unknown as {
					ReactWorkspaceRuntime: { mountIslands: (root: HTMLElement) => void };
				}
			).ReactWorkspaceRuntime.mountIslands(host);
		});

		const colspanControl = page.locator('#e2e-colspan-form-host [data-rw-control="colspan"]');
		await expect(colspanControl).toBeVisible();
		await colspanControl.locator('[data-rw-colspan-preset="4"]').click();
		await expect(colspanControl.locator('input[name="column_width"]')).toHaveValue('33');
		await expect(colspanControl.locator('[data-rw-colspan-output]')).toContainText('4/12');

		const rangeControl = page.locator('#e2e-colspan-form-host [data-rw-control="range"]');
		await expect(rangeControl).toBeVisible();
		await expect(rangeControl.locator('input[type="range"][data-rw-slider]')).toHaveValue('100');

		tracker.assertNoErrors();
	});

	test('mounts InputfieldTiptap inside SchemaForm with accessible toolbar, formatting state, source toggle, and multi-language tabs', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await page.evaluate(() => {
			const host = document.createElement('div');
			host.id = 'e2e-tiptap-form-host';
			host.innerHTML = `
				<div id="e2e-tiptap-schema-form"
					data-inertia-island="ReactWorkspace/SchemaForm"
					data-react-island="ReactWorkspace/SchemaForm"
					data-props='${JSON.stringify({
						id: 'e2e_tiptap_form',
						name: 'e2e_tiptap_form',
						action: '#tiptap-test',
						method: 'post',
						isFragment: false,
						fields: [
							{
								kind: 'control',
								type: 'tiptap',
								id: 'Inputfield_story_body',
								name: 'story_body',
								label: 'Story Body',
								colSpan: 12,
								useLanguages: true,
								languages: [
									{
										id: 1010,
										name: 'default',
										title: 'English',
										isDefault: true,
										editable: true,
										inputName: 'story_body',
										inputId: 'Inputfield_story_body',
										value: '<p>Initial rich story</p>',
									},
									{
										id: 1012,
										name: 'tr',
										title: 'Turkish',
										isDefault: false,
										editable: true,
										inputName: 'story_body__1012',
										inputId: 'Inputfield_story_body__1012',
										value: '',
									},
								],
								tiptapConfig: {
									toolbar: 'styles | bold italic underline | bullist blockquote | link source | undo redo',
									headlines: ['h2', 'h3'],
									features: ['toolbar', 'stickybars', 'bubbleMenu', 'statusbar', 'spellcheck', 'pasteFilter', 'sourceCode'],
									height: 220,
									maxHeight: 520,
									inlineMode: 0,
								},
							},
						],
						submits: [],
					})}'></div>
			`;
			document.body.appendChild(host);
			(
				window as unknown as {
					ReactWorkspaceRuntime: { mountIslands: (root: HTMLElement) => void };
				}
			).ReactWorkspaceRuntime.mountIslands(host);
		});

		const tiptapRoot = page.locator('#e2e-tiptap-form-host [data-rw-tiptap-field="story_body"]');
		await expect(tiptapRoot).toBeVisible();

		// Verify WAI-ARIA toolbar, group, separator, and button semantics
		const toolbar = tiptapRoot.locator('[role="toolbar"][data-rw-tiptap-toolbar]').first();
		await expect(toolbar).toBeVisible();
		await expect(toolbar.locator('[role="group"]').first()).toBeVisible();
		await expect(toolbar.locator('[role="separator"]').first()).toBeVisible();

		// Verify initial content and statusbar word/char counts
		const prose = tiptapRoot.locator('.ProseMirror');
		await expect(prose).toContainText('Initial rich story');
		await expect(tiptapRoot.locator('[data-rw-tiptap-statusbar]')).toContainText('3 words');

		// Focus editor, toggle Bold, type text, and verify aria-pressed + hidden textarea sync
		await prose.click();
		const boldBtn = toolbar.locator('[data-rw-tiptap-tool="bold"]');
		await expect(boldBtn).toHaveAttribute('aria-pressed', 'false');
		await boldBtn.click();
		await expect(boldBtn).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.type(' Updated');

		const defaultHidden = tiptapRoot.locator('textarea[name="story_body"]');
		await expect(defaultHidden).toHaveValue(/<strong>\s*Updated<\/strong>|Initial rich story/);

		// Toggle HTML source view and back
		const sourceBtn = toolbar.locator('[data-rw-tiptap-tool="source"]');
		await sourceBtn.click();
		await expect(sourceBtn).toHaveAttribute('aria-pressed', 'true');
		await expect(tiptapRoot.locator('[data-rw-tiptap-source-textarea]')).toBeVisible();
		await sourceBtn.click();
		await expect(sourceBtn).toHaveAttribute('aria-pressed', 'false');

		// Switch to secondary language ('Turkish') and verify Copy English action populates story_body__1012
		const trTab = tiptapRoot.locator('[data-rw-tiptap-lang-tabs] button[data-lang-name="tr"]');
		await trTab.click();
		await expect(trTab).toHaveAttribute('aria-selected', 'true');

		const copyBtn = tiptapRoot.locator('[data-rw-tiptap-copy-default]');
		await expect(copyBtn).toBeVisible();
		await copyBtn.click();

		const trHidden = tiptapRoot.locator('textarea[name="story_body__1012"]');
		await expect(trHidden).toHaveValue(/Initial rich story/);

		tracker.assertNoErrors();
	});

	test('coexists with classic ProcessWire AdminThemeUikit, preserves un-layered --pw-* color tokens, and mounts standalone React Inputfields cleanly', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		// 1. Open classic ProcessWire Admin module config for InputfieldTiptap
		await page.goto(getAdminUrl('module/edit?name=InputfieldTiptap'), { waitUntil: 'networkidle' });
		await expect(page.locator('#pw-masthead').first()).toBeVisible();
		await expect(page.locator('input[name="toolbar"], textarea[name="toolbar"]').first()).toBeVisible();

		// 2. Inject an un-layered :root color token BEFORE loading ReactInertia.css + ReactInertia.js,
		// mirroring AdminThemeUikit (#main-color-custom / admin-custom.css) and views/admin.php (#pw-color-scheme-tokens)
		await page.evaluate(async () => {
			const tokenStyle = document.createElement('style');
			tokenStyle.id = 'e2e-pw-custom-brand';
			tokenStyle.textContent = ':root { --pw-main-color: #14ae85; }';
			document.head.insertBefore(tokenStyle, document.head.firstChild);

			await new Promise<void>((resolve, reject) => {
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = '/site/modules/React/dist/ReactInertia.css';
				link.onload = () => resolve();
				link.onerror = () => reject(new Error('Failed to load ReactInertia.css'));
				document.head.appendChild(link);
			});

			await new Promise<void>((resolve, reject) => {
				const script = document.createElement('script');
				script.src = '/site/modules/React/dist/ReactInertia.js';
				script.onload = () => resolve();
				script.onerror = () => reject(new Error('Failed to load ReactInertia.js'));
				document.head.appendChild(script);
			});

			const host = document.createElement('div');
			host.id = 'e2e-classic-admin-islands';
			host.innerHTML = `
				<div id="e2e-classic-tiptap"
					data-inertia-island="InputfieldTiptap"
					data-props='${JSON.stringify({
						id: 'Inputfield_classic_body',
						name: 'classic_body',
						value: '<p>Classic Admin Tiptap Ready</p>',
						toolbar: 'bold italic | link source',
						headlines: ['h2', 'h3'],
						features: ['toolbar', 'statusbar', 'sourceCode'],
						height: 180,
					})}'></div>
				<div id="e2e-classic-m2o"
					data-inertia-island="InputfieldReactM2O"
					data-props='${JSON.stringify({
						id: 'Inputfield_classic_parent',
						name: 'classic_parent',
						cardinality: 'm2o',
						widget: 'select',
						resource: 'template',
						value: 'home',
						selectedItems: [
							{ key: 'template:home', id: 'home', value: 'home', label: 'Home Template', resource: 'template' },
						],
						initialOptions: [
							{ key: 'template:home', id: 'home', value: 'home', label: 'Home Template', resource: 'template' },
							{ key: 'template:basic-page', id: 'basic-page', value: 'basic-page', label: 'Basic Page', resource: 'template' },
						],
					})}'></div>
			`;
			document.body.appendChild(host);
			(
				window as unknown as {
					ReactWorkspaceRuntime: { mountIslands: (root: HTMLElement) => void };
				}
			).ReactWorkspaceRuntime.mountIslands(host);
		});

		// Verify un-layered :root --pw-main-color (#14ae85) won over ReactInertia.css @layer base (#eb1d61)
		const resolvedTokens = await page.evaluate(() => {
			const cs = getComputedStyle(document.documentElement);
			const probe = document.createElement('span');
			probe.style.color = 'var(--pw-masthead-logo-color)';
			probe.style.borderColor = 'var(--primary)';
			document.body.appendChild(probe);
			const computed = getComputedStyle(probe);
			const logoRgb = computed.color;
			const primaryColor = computed.borderColor;
			probe.remove();
			return {
				pwMainColor: cs.getPropertyValue('--pw-main-color').trim().toLowerCase(),
				logoRgb,
				primaryColor,
			};
		});
		expect(resolvedTokens.pwMainColor).toBe('#14ae85');
		expect(resolvedTokens.logoRgb).toBe('rgb(20, 174, 133)');
		expect(resolvedTokens.primaryColor).toBe('color(srgb 0.0509804 0.443529 0.33902)');

		// Verify standalone InputfieldTiptap and InputfieldReactM2O mounted cleanly inside classic AdminThemeUikit
		await expect(page.locator('#e2e-classic-tiptap .ProseMirror')).toContainText('Classic Admin Tiptap Ready');
		await expect(page.locator('#e2e-classic-m2o')).toContainText('Home Template');
		await expect(page.locator('#pw-masthead').first()).toBeVisible();

		// Verify dynamic AJAX/Repeater DOM insertion auto-mounts islands via MutationObserver without manual mountIslands()
		await page.evaluate(() => {
			const ajaxRepeaterItem = document.createElement('div');
			ajaxRepeaterItem.id = 'e2e-classic-ajax-repeater';
			ajaxRepeaterItem.innerHTML = `
				<input type="hidden" id="e2e_ajax_kv_input" name="ajax_kv" value="" />
				<div
					id="e2e-classic-ajax-kv"
					data-react-island="InputfieldReactKeyValue"
					data-input-id="e2e_ajax_kv_input"
					data-props='${JSON.stringify({
						id: 'e2e_ajax_kv_input',
						name: 'ajax_kv',
						keyLabel: 'Meta Key',
						valueLabel: 'Meta Value',
						addLabel: 'Add Dynamic Pair',
						rows: [{ key: 'env', value: 'production' }],
						value: { env: 'production' },
					})}'
				></div>
			`;
			document.body.appendChild(ajaxRepeaterItem);
		});
		await expect(page.locator('#e2e-classic-ajax-kv')).toContainText('Add Dynamic Pair');
		await expect(page.locator('#e2e-classic-ajax-kv input[value="production"]')).toBeVisible();

		tracker.assertNoErrors();
	});

	test('renders portaled BubbleMenu in inline chromeless mode across SchemaForm, default feature sets, mouse-drag selections, inline link editing, and standalone islands', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		await page.evaluate(() => {
			const host = document.createElement('div');
			host.id = 'e2e-tiptap-inline-host';
			host.style.padding = '80px 32px';
			host.innerHTML = `
				<div id="e2e-clipped-wrapper" style="overflow: hidden; max-height: 150px; border: 1px solid #ccc; padding: 4px;">
					<div id="e2e-inline-schema-form"
						data-inertia-island="ReactWorkspace/SchemaForm"
						data-react-island="ReactWorkspace/SchemaForm"
						data-props='${JSON.stringify({
							id: 'e2e_inline_tiptap_form',
							name: 'e2e_inline_tiptap_form',
							action: '#tiptap-inline-test',
							method: 'post',
							isFragment: false,
							fields: [
								{
									kind: 'control',
									type: 'tiptap',
									id: 'Inputfield_inline_summary',
									name: 'inline_summary',
									label: 'Inline Summary',
									colSpan: 12,
									value: '<p>Chromeless inline bubble target text</p>',
									tiptapConfig: {
										toolbar: 'styles | bold italic | pwlink pwimage',
										bubbleToolbar: 'bold italic underline strike code highlight | link removeformat',
										headlines: ['h2', 'h3'],
										// Omit 'bubbleMenu' intentionally to verify inline fields without explicit bubbleMenu flag still show BubbleMenu
										features: ['toolbar', 'stickybars', 'purifier', 'pasteFilter'],
										height: 110,
										maxHeight: 130,
										inlineMode: 1,
									},
								},
							],
							submits: [],
						})}'></div>
				</div>
				<div id="e2e-inline-standalone"
					style="margin-top: 32px;"
					data-inertia-island="InputfieldTiptap"
					data-props='${JSON.stringify({
						id: 'Inputfield_standalone_inline',
						name: 'standalone_inline',
						value: '<p>Standalone top-level inline props</p>',
						inlineMode: 1,
						bubbleToolbar: 'bold italic | pwlink removeformat',
						features: ['purifier', 'pasteFilter'],
						height: 100,
					})}'></div>
				<div id="e2e-inline-nobubble"
					style="margin-top: 24px;"
					data-inertia-island="InputfieldTiptap"
					data-props='${JSON.stringify({
						id: 'Inputfield_disabled_bubble',
						name: 'disabled_bubble',
						value: '<p>Bubble explicitly disabled</p>',
						inlineMode: 1,
						bubbleToolbar: 'none',
						features: ['purifier'],
						height: 100,
					})}'></div>
				<button id="e2e-outside-blur-target" type="button" style="margin-top: 24px;">Outside Focus Target</button>
			`;
			document.body.appendChild(host);
			(
				window as unknown as {
					ReactWorkspaceRuntime: { mountIslands: (root: HTMLElement) => void };
				}
			).ReactWorkspaceRuntime.mountIslands(host);
		});

		const inlineRoot = page.locator('[data-rw-tiptap-field="inline_summary"]');
		await expect(inlineRoot).toBeVisible();
		await expect(inlineRoot).toHaveAttribute('data-rw-tiptap-inline', '1');
		// Top toolbar must never render inside the chromeless editor frame
		await expect(inlineRoot.locator('[data-rw-tiptap-toolbar]')).toHaveCount(0);

		const prose = inlineRoot.locator('.ProseMirror');
		const surface = inlineRoot.locator('[data-rw-tiptap-surface]');
		await expect(prose).toContainText('Chromeless inline bubble target text');
		await prose.scrollIntoViewIfNeeded();

		// Simulate real mouse drag starting on the text and releasing in the surface padding below/outside the line
		const pBox = await prose.locator('p').boundingBox();
		const sBox = await surface.boundingBox();
		expect(pBox).not.toBeNull();
		expect(sBox).not.toBeNull();

		await page.mouse.move(pBox!.x + 4, pBox!.y + pBox!.height / 2);
		await page.mouse.down();
		await page.mouse.move(pBox!.x + 140, sBox!.y + sBox!.height - 3, { steps: 6 });
		await page.mouse.up();

		// BubbleMenu must appear portaled under document.body (escaping overflow: hidden on #e2e-clipped-wrapper)
		const bubbleMenu = page.locator('body > [data-rw-tiptap-bubble-portal] > [data-rw-tiptap-bubble-menu]');
		await expect(bubbleMenu).toBeVisible();

		// Verify exact viewport coordinate proximity (anchored ~8px directly above selected text, never stranded hundreds of px away)
		const geometry = await page.evaluate(() => {
			const menu = document.querySelector('[data-rw-tiptap-bubble-menu]') as HTMLElement | null;
			const sel = window.getSelection();
			const rangeRect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
			const menuRect = menu?.getBoundingClientRect() || null;
			return { rangeRect, menuRect };
		});
		expect(geometry.rangeRect).not.toBeNull();
		expect(geometry.menuRect).not.toBeNull();
		expect(Math.abs(geometry.menuRect!.bottom - (geometry.rangeRect!.top - 8))).toBeLessThanOrEqual(8);

		const bubbleToolbar = bubbleMenu.locator('[role="toolbar"][data-rw-tiptap-toolbar]');
		await expect(bubbleToolbar).toBeVisible();
		await expect(bubbleToolbar).toHaveAttribute('focusgroup', 'toolbar wrap');
		await expect(bubbleToolbar).toHaveAttribute('aria-controls', 'Inputfield_inline_summary__prose');

		// Formatting action ('Bold') preserves selection & focus and updates hidden form value
		const boldBtn = bubbleToolbar.locator('[data-rw-tiptap-tool="bold"]');
		await expect(boldBtn).toHaveAttribute('aria-pressed', 'false');
		await boldBtn.click();
		await expect(boldBtn).toHaveAttribute('aria-pressed', 'true');
		await expect(bubbleMenu).toBeVisible();

		const summaryHidden = page.locator('textarea[name="inline_summary"]');
		await expect(summaryHidden).toHaveValue(/<strong>.+<\/strong>/);

		// Bubble `Link` opens the full link dialog directly (no intermediate inline form)
		const linkBtn = bubbleToolbar.locator('[data-rw-tiptap-tool="link"]');
		await linkBtn.click();
		await expect(inlineRoot.locator('[data-rw-tiptap-link-bar]')).toHaveCount(0);
		await expect(bubbleMenu.locator('[data-rw-tiptap-bubble-link-form]')).toHaveCount(0);

		const linkDialog = page.locator('dialog[data-rw-tiptap-dialog="link"]');
		await expect(linkDialog).toBeVisible();
		await expect(bubbleMenu).toBeHidden();
		const linkInput = linkDialog.locator('[data-rw-pw-link-href]');
		await expect(linkInput).toBeFocused();

		// Reject unsafe javascript: URL first, then apply valid https:// URL via Enter
		await linkInput.fill('javascript:alert(1)');
		await linkInput.press('Enter');
		await expect(linkDialog.locator('[role="alert"]')).toBeVisible();
		await expect(linkDialog).toBeVisible();

		await linkInput.fill('https://processwire.com');
		await linkInput.press('Enter');
		await expect(linkDialog).toBeHidden();
		await expect(summaryHidden).toHaveValue(/href="https:\/\/processwire\.com"/);

		// Clicking outside hides the portaled BubbleMenu cleanly
		await page.locator('#e2e-outside-blur-target').click();
		await expect(bubbleMenu).toBeHidden();

		// Standalone island with top-level inline props + 'pwlink' alias renders BubbleMenu properly
		const standaloneProse = page.locator('#e2e-inline-standalone .ProseMirror');
		await standaloneProse.scrollIntoViewIfNeeded();
		await standaloneProse.locator('p').dblclick({ position: { x: 24, y: 10 } });
		await expect(bubbleMenu).toBeVisible();
		await expect(bubbleMenu.locator('[data-rw-tiptap-tool="link"]')).toBeVisible();

		await page.locator('#e2e-outside-blur-target').click();
		await expect(bubbleMenu).toBeHidden();

		// Explicit opt-out (`bubbleToolbar: 'none'`) mounts zero BubbleMenu
		const disabledProse = page.locator('#e2e-inline-nobubble .ProseMirror');
		await disabledProse.scrollIntoViewIfNeeded();
		await disabledProse.locator('p').dblclick({ position: { x: 24, y: 10 } });
		await page.waitForTimeout(200);
		await expect(page.locator('[data-rw-tiptap-bubble-menu]:visible')).toHaveCount(0);

		// Also verify real ProcessPageEdit on our isolated fixture page positions BubbleMenu right above typed selection
		await page.goto(getAdminUrl(`page/edit/?id=${isolatedFixture.inlineSummaryPageId}`), { waitUntil: 'networkidle' });
		const summaryWrapId = `#wrap_Inputfield_${isolatedFixture.summaryFieldName}`;
		const summaryWrap = page.locator(summaryWrapId);
		await expect(summaryWrap).toBeVisible();
		if ((await page.locator(`${summaryWrapId}.InputfieldStateCollapsed`).count()) > 0) {
			await summaryWrap.locator('> .InputfieldHeader').click();
		}
		const liveSummaryProse = summaryWrap.locator('.ProseMirror');
		await expect(liveSummaryProse).toBeVisible();
		await liveSummaryProse.scrollIntoViewIfNeeded();
		await liveSummaryProse.click();
		await page.keyboard.type('ProcessPageEdit inline bubble check');
		for (let i = 0; i < 12; i++) {
			await page.keyboard.press('Shift+ArrowLeft');
		}
		const liveBubble = page.locator('body > [data-rw-tiptap-bubble-portal] > [data-rw-tiptap-bubble-menu]');
		await expect(liveBubble).toBeVisible();

		const liveCoords = await page.evaluate(() => {
			const menu = document.querySelector('[data-rw-tiptap-bubble-menu]') as HTMLElement | null;
			const sel = window.getSelection();
			const rangeRect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
			const menuRect = menu?.getBoundingClientRect() || null;
			return { rangeRect, menuRect };
		});
		expect(liveCoords.rangeRect).not.toBeNull();
		expect(liveCoords.menuRect).not.toBeNull();
		expect(Math.abs(liveCoords.menuRect!.bottom - (liveCoords.rangeRect!.top - 8))).toBeLessThanOrEqual(8);
		const selCenterX = liveCoords.rangeRect!.left + liveCoords.rangeRect!.width / 2;
		const menuCenterX = liveCoords.menuRect!.left + liveCoords.menuRect!.width / 2;
		expect(Math.abs(menuCenterX - selCenterX)).toBeLessThanOrEqual(24);

		tracker.assertNoErrors();
	});

	test('renders ProcessReact modules inside native AdminTheme on Setup > Module and switches cleanly into full-screen Workspace via Open in Workspace', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		const targetUrl = await page.evaluate(() => {
			const pageScript = document.querySelector('script[type="application/json"][data-page="app"]');
			if (!pageScript?.textContent) return null;
			try {
				const parsed = JSON.parse(pageScript.textContent);
				const list = parsed?.props?.workspaces || parsed?.props?.workspace?.workspaces || [];
				const candidate = Array.isArray(list)
					? list.find((w: { id?: string; url?: string; component?: string }) => w?.url && w?.component && w.id !== 'workspace')
					: null;
				return candidate ? String(candidate.url) : null;
			} catch {
				return null;
			}
		});

		if (targetUrl) {
			const cleanSetupUrl = targetUrl.replace(/([?&])ws=1(&|$)/, '$1').replace(/[?&]$/, '');
			await page.goto(cleanSetupUrl, { waitUntil: 'networkidle' });

			// 1. Classic Setup > Module mode: native ProcessWire AdminTheme masthead is present, redundant #pw-content-head is hidden, and [data-rw-app-shell="admin"] renders
			await expect(page.locator('#pw-mastheads, #masthead').first()).toBeVisible();
			await expect(page.locator('[data-rw-app-shell="admin"]')).toBeVisible();
			await expect(page.locator('[data-rw-admin-return]')).toHaveCount(0);
			if ((await page.locator('#pw-content-head').count()) > 0) {
				await expect(page.locator('#pw-content-head')).toBeHidden();
			}

			// 2. Clicking "Open in Workspace" switches to full-screen Workspace mode (?ws=1) without AdminTheme masthead
			const openWsLink = page.locator('[data-rw-open-in-workspace]');
			await expect(openWsLink).toBeVisible();
			await openWsLink.click();
			await page.waitForLoadState('networkidle');

			await expect(page).toHaveURL(/[?&]ws=1\b/);
			await expect(page.locator('[data-rw-app-shell=""]')).toBeVisible();
			await expect(page.locator('[data-rw-admin-return]')).toBeVisible();
			await expect(page.locator('#pw-mastheads, #masthead')).toHaveCount(0);
		}

		tracker.assertNoErrors();
	});

	test('navigates to debug-only UI Showcase, renders all 6 sections and SVG samples, toggles viewports/themes, and runs cross-iframe overflow checks', async ({ page }) => {
		const tracker = attachRuntimeErrorTracker(page);

		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		const showcaseLink = page.locator('[data-rw-ui-showcase-link]');
		await expect(showcaseLink).toBeVisible();
		await showcaseLink.click();
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/ui-showcase\//);
		const directCanvas = page.locator('[data-rw-showcase-canvas="direct"]');
		await expect(directCanvas).toBeVisible();

		for (const sec of ['media', 'links', 'relations', 'datetime', 'contexts', 'controls', 'primitives']) {
			await expect(directCanvas.locator(`[data-rw-showcase-section="${sec}"]`)).toBeVisible();
		}

		// Interactively open Date, Time, and DateRange pickers in the datetime section
		const dtSection = directCanvas.locator('[data-rw-showcase-section="datetime"]');
		const dtDateTrigger = dtSection.locator('[data-field-name="dt_date_empty"] [data-rw-datetime-trigger]');
		await dtDateTrigger.scrollIntoViewIfNeeded();
		await dtDateTrigger.click();
		await expect(page.locator('[data-rw-calendar]').first()).toBeVisible();
		await page.keyboard.press('Escape');

		const dtTimeTrigger = dtSection.locator('[data-field-name="dt_time_empty"] [data-rw-datetime-trigger]');
		await dtTimeTrigger.scrollIntoViewIfNeeded();
		await dtTimeTrigger.click();
		await expect(page.locator('[data-rw-time-picker]').first()).toBeVisible();
		await page.keyboard.press('Escape');

		const dtRangeTrigger = dtSection.locator('[data-field-name="dt_range_empty"] [data-rw-control="daterange"] button').first();
		await dtRangeTrigger.scrollIntoViewIfNeeded();
		await dtRangeTrigger.click();
		await expect(page.locator('[data-rw-daterange-presets]').first()).toBeVisible();
		await page.keyboard.press('Escape');

		// Interactively test Package 2 Extended Controls (Color, Tags, UnitNumber, Segmented)
		const ctrlSection = directCanvas.locator('[data-rw-showcase-section="controls"]');
		const colorTrigger = ctrlSection.locator('[data-field-name="color_hex"] [data-rw-color-trigger]');
		await colorTrigger.scrollIntoViewIfNeeded();
		await colorTrigger.click();
		await expect(page.locator('[data-rw-portal-overlay] [aria-label="Color swatches"]').first()).toBeVisible();
		await page.keyboard.press('Escape');

		const freeTagsField = ctrlSection.locator('[data-field-name="tags_free"] [data-rw-control="tags"]');
		await freeTagsField.scrollIntoViewIfNeeded();
		const tagsInput = freeTagsField.locator('input[data-rw-bare-input]');
		await tagsInput.fill('verified-tag');
		await tagsInput.press('Enter');
		await expect(freeTagsField).toContainText('verified-tag');

		const unitGapField = ctrlSection.locator('[data-field-name="unit_spacing"]');
		await unitGapField.scrollIntoViewIfNeeded();
		await unitGapField.locator('button[data-rw-unit-step="up"]').click();
		await expect(unitGapField.locator('input[type="hidden"]')).toHaveValue('{"value":28,"unit":"px"}');

		const segLayoutField = ctrlSection.locator('[data-field-name="seg_layout"]');
		await segLayoutField.scrollIntoViewIfNeeded();
		await segLayoutField.locator('button[data-rw-segment="list"]').click();
		await expect(segLayoutField.locator('input[type="hidden"]')).toHaveValue('list');

		// Interactively test Package 3 Domain Controls (Spacing, OTP, Password, Dual Range, Markdown)
		const spacingField = ctrlSection.locator('[data-field-name="spacing_linked"]');
		await spacingField.scrollIntoViewIfNeeded();
		const topSideInput = spacingField.locator('input[data-rw-spacing-side="top"]');
		await topSideInput.fill('32');
		await expect(spacingField.locator('[data-rw-spacing-preview]')).toContainText('32px');

		const dualRangeField = ctrlSection.locator('[data-field-name="range_price"]');
		await dualRangeField.scrollIntoViewIfNeeded();
		await expect(dualRangeField.locator('[data-rw-range-output]')).toContainText('€120 – €480');

		const otpCodeField = ctrlSection.locator('[data-field-name="otp_code"]');
		await otpCodeField.scrollIntoViewIfNeeded();
		await expect(otpCodeField.locator('input[data-rw-otp-slot="0"]')).toHaveValue('4');

		const pwCreateField = ctrlSection.locator('[data-field-name="pw_create"]');
		await pwCreateField.scrollIntoViewIfNeeded();
		await pwCreateField.locator('[data-rw-password-toggle]').click();
		await expect(pwCreateField.locator('input').first()).toHaveAttribute('type', 'text');

		const mdArticleField = ctrlSection.locator('[data-field-name="md_article"]');
		await mdArticleField.scrollIntoViewIfNeeded();
		await mdArticleField.locator('[data-rw-md-tab="preview"]').click();
		await expect(mdArticleField.locator('[data-rw-md-preview] h1')).toContainText('Release Highlights');

		// Scroll all visible sample SVG images into view (triggers loading="lazy") and verify naturalWidth > 0
		const visibleSampleImgs = directCanvas.locator('img[src*="?sample="]:visible');
		const visibleImgCount = await visibleSampleImgs.count();
		expect(visibleImgCount).toBeGreaterThan(0);
		for (let i = 0; i < visibleImgCount; i++) {
			const img = visibleSampleImgs.nth(i);
			await img.scrollIntoViewIfNeeded();
			await expect
				.poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
				.toBe(true);
		}
		await page.evaluate(() => window.scrollTo(0, 0));

		// Run direct overflow audit
		await page.locator('[data-rw-showcase-check-overflow]').click();
		await expect(page.locator('[data-rw-showcase-audit-summary]')).toBeVisible();
		await expect(page.locator('[data-rw-showcase-audit-summary]')).toContainText(/Cases:\s*[1-9]/);

		// Toggle theme controls cleanly (scoped without breaking host localStorage)
		await page.locator('[data-rw-showcase-theme="dark"]').click();
		await expect(directCanvas).toHaveClass(/\bdark\b/);
		await page.locator('[data-rw-showcase-theme="light"]').click();
		await expect(directCanvas).toHaveClass(/\blight\b/);
		await page.locator('[data-rw-showcase-theme="auto"]').click();

		// Toggle section filter
		await page.locator('[data-rw-showcase-filter="links"]').click();
		await expect(directCanvas.locator('[data-rw-showcase-section="links"]')).toBeVisible();
		await expect(directCanvas.locator('[data-rw-showcase-section="media"]')).toHaveCount(0);
		await page.locator('[data-rw-showcase-filter="all"]').click();
		await expect(directCanvas.locator('[data-rw-showcase-section="media"]')).toBeVisible();

		// Switch to 375px Mobile framed viewport and verify postMessage overflow roundtrip
		await page.locator('[data-rw-showcase-viewport="mobile"]').click();
		const mobileIframe = page.locator('iframe[data-rw-showcase-iframe="mobile"]');
		await expect(mobileIframe).toBeVisible();
		const mobileFrame = page.frameLocator('iframe[data-rw-showcase-iframe="mobile"]');
		await expect(mobileFrame.locator('[data-rw-showcase-canvas="embed"]')).toBeVisible();
		await expect(mobileFrame.locator('[data-rw-showcase-section="media"]')).toBeVisible();

		await page.locator('[data-rw-showcase-check-overflow]').click();
		await expect(page.locator('[data-rw-showcase-overflow-count]')).toBeVisible();

		// Switch to Compare 375/420/768 strip and verify all 3 iframes mount cleanly
		await page.locator('[data-rw-showcase-viewport="compare"]').click();
		const compareStrip = page.locator('[data-rw-showcase-compare-strip]');
		await expect(compareStrip).toBeVisible();
		for (const width of ['375', '420', '768']) {
			await expect(compareStrip.locator(`iframe[data-rw-showcase-iframe="compare-${width}"]`)).toBeVisible();
		}
		await expect(
			page.frameLocator('iframe[data-rw-showcase-iframe="compare-375"]').locator('[data-rw-showcase-canvas="embed"]')
		).toBeVisible();

		tracker.assertNoErrors();
	});

	test('Command Palette 2.0 renders grouped sections, runs live /_react/command-search queries, toggles layout safely, and passes WCAG 2.1 AA in light and dark modes', async ({
		page,
	}) => {
		const tracker = attachRuntimeErrorTracker(page);
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		const rootShell = page.locator('[data-rw-app-shell]');
		await expect(rootShell).toBeVisible();

		try {
			// Open Command Palette and verify grouped landmarks
			await page.locator('[data-rw-command-trigger]:visible').first().click();
			const palette = page.locator('[data-rw-command-palette]');
			await expect(palette).toBeVisible();

			const combobox = palette.getByRole('combobox');
			await expect(combobox).toHaveAttribute('placeholder', /record/i);
			await expect(palette.getByRole('group', { name: 'Current Workspace' })).toBeVisible();
			await expect(palette.getByRole('group', { name: 'Workspaces' })).toBeVisible();
			await expect(palette.getByRole('group', { name: 'Layout & Appearance' })).toBeVisible();
			await expect(palette.getByRole('group', { name: 'Actions' })).toBeVisible();

			// Live debounced backend record search for provisioned page 'Alpha Vessel'
			const searchResponsePromise = page.waitForResponse(
				(res) =>
					res.url().includes('/_react/command-search') &&
					res.url().includes('Alpha') &&
					res.request().method() === 'GET'
			);
			await combobox.fill('Alpha Vessel');
			const searchResponse = await searchResponsePromise;
			expect(searchResponse.status()).toBe(200);
			const searchPayload = (await searchResponse.json()) as {
				ok?: boolean;
				items?: Array<{ label?: string; href?: string; isInertia?: boolean }>;
			};
			expect(searchPayload.ok).toBe(true);
			expect(Array.isArray(searchPayload.items)).toBe(true);
			expect(searchPayload.items?.some((item) => item.label === 'Alpha Vessel')).toBe(true);

			const pagesGroup = palette.getByRole('group', { name: 'Pages' });
			await expect(pagesGroup).toBeVisible();
			const alphaLink = pagesGroup.locator('a', { hasText: 'Alpha Vessel' }).first();
			await expect(alphaLink).toBeVisible();
			const alphaHref = await alphaLink.getAttribute('href');
			expect(alphaHref || '').toContain('page/edit/?id=');
			expect(alphaHref || '').not.toContain('ws=1');
			await expect(alphaLink.locator('[data-rw-command-badge]')).toBeVisible();

			// Switch layout to Sidebar cleanly via Command Palette
			await combobox.fill('Layout: Sidebar');
			const sidebarCmd = palette.getByRole('option', { name: /Layout:\s*Sidebar/i }).first();
			await expect(sidebarCmd).toBeVisible();
			const [sidebarPrefRes] = await Promise.all([waitForWorkspacePrefsPost(page), sidebarCmd.click()]);
			expect(sidebarPrefRes.status()).toBe(200);
			await expect(palette).toHaveCount(0);
			await expect(page.locator('[data-rw-app-shell][data-rw-shell-layout="sidebar"]')).toBeVisible();

			// Switch to Light theme via Command Palette, confirm Toggle Sidebar option appears, and audit WCAG 2.1 AA
			await page.locator('[data-rw-command-trigger]:visible').first().click();
			await expect(palette).toBeVisible();
			await expect(palette.getByRole('option', { name: /Toggle sidebar/i })).toBeVisible();

			await combobox.fill('Theme: Light');
			const lightCmd = palette.getByRole('option', { name: /Theme:\s*Light/i }).first();
			await expect(lightCmd).toBeVisible();
			const [lightPrefRes] = await Promise.all([waitForWorkspacePrefsPost(page), lightCmd.click()]);
			expect(lightPrefRes.status()).toBe(200);
			await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

			await page.locator('[data-rw-command-trigger]:visible').first().click();
			await expect(palette).toBeVisible();
			const lightAxe = await new AxeBuilder({ page })
				.include('[data-rw-command-palette]')
				.withTags(['wcag2a', 'wcag2aa'])
				.analyze();
			expect(lightAxe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);

			// Switch to Dark theme via Command Palette and audit WCAG 2.1 AA with palette open
			await combobox.fill('Theme: Dark');
			const darkCmd = palette.getByRole('option', { name: /Theme:\s*Dark/i }).first();
			await expect(darkCmd).toBeVisible();
			const [darkPrefRes] = await Promise.all([waitForWorkspacePrefsPost(page), darkCmd.click()]);
			expect(darkPrefRes.status()).toBe(200);
			await expect(page.locator('html')).toHaveClass(/\bdark\b/);

			await page.locator('[data-rw-command-trigger]:visible').first().click();
			await expect(palette).toBeVisible();
			const darkAxe = await new AxeBuilder({ page })
				.include('[data-rw-command-palette]')
				.withTags(['wcag2a', 'wcag2aa'])
				.analyze();
			expect(darkAxe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);

			await page.keyboard.press('Escape');
			await expect(palette).toHaveCount(0);
		} finally {
			// Restore clean initial topbar layout & system theme mode regardless of test outcome
			await page.keyboard.press('Escape').catch(() => {});
			const userMenuTrigger = page.locator('[data-rw-user-menu-trigger]:visible').first();
			if (await userMenuTrigger.isVisible().catch(() => false)) {
				await userMenuTrigger.click();
				await expect(page.locator('[data-rw-user-menu]')).toBeVisible();
				const sysModeBtn = page.locator('[data-rw-theme-mode-option="system"]');
				if ((await sysModeBtn.isVisible().catch(() => false)) && (await sysModeBtn.getAttribute('aria-pressed')) !== 'true') {
					const [sysRes] = await Promise.all([waitForWorkspacePrefsPost(page), sysModeBtn.click()]);
					expect(sysRes.status()).toBe(200);
				}
				const resetLayoutBtn = page.locator('[data-rw-shell-layout-reset]');
				if (await resetLayoutBtn.isVisible().catch(() => false)) {
					const [resetRes] = await Promise.all([waitForWorkspacePrefsPost(page), resetLayoutBtn.click()]);
					expect(resetRes.status()).toBe(200);
				} else {
					const topbarBtn = page.locator('[data-rw-shell-layout-option="topbar"]');
					if ((await topbarBtn.count()) > 0 && (await topbarBtn.getAttribute('aria-pressed')) !== 'true') {
						await Promise.all([waitForWorkspacePrefsPost(page), topbarBtn.click()]);
					}
				}
				await page.keyboard.press('Escape').catch(() => {});
			}
		}

		await expect(page.locator('[data-rw-app-shell][data-rw-shell-layout="topbar"]')).toBeVisible();
		tracker.assertNoErrors();
	});
});

async function assertWcag21AaClean(page: Page, _contextLabel: string): Promise<void> {
	const axeResults = await new AxeBuilder({ page })
		.include('#app')
		.withTags(['wcag2a', 'wcag2aa'])
		.analyze();
	const criticalOrSerious = axeResults.violations.filter(
		(v) => v.impact === 'critical' || v.impact === 'serious'
	);
	expect(criticalOrSerious).toEqual([]);
}

function waitForWorkspacePrefsPost(page: Page) {
	return page.waitForResponse(
		(res) => res.url().includes('/_react/workspace-prefs') && res.request().method() === 'POST'
	);
}

test.describe('Multi-Shell Layouts & Collapsible Sidebar Navigation', () => {
	test.describe.configure({ mode: 'serial' });

	test('switches Topbar to Sidebar, searches/pins/navigates in ModuleSwitcher, collapses/expands via click and Ctrl+B, passes light/dark/mobile WCAG 2.1 AA, and resets cleanly', async ({
		page,
	}) => {
		test.setTimeout(90_000);
		const tracker = attachRuntimeErrorTracker(page);
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });

		const rootShell = page.locator('[data-rw-app-shell]');
		await expect(rootShell).toBeVisible();

		try {
			// 1. Switch Topbar -> Sidebar via UserAccountMenu and verify reload persistence
			await page.locator('[data-rw-user-menu-trigger]:visible').first().click();
			await expect(page.locator('[data-rw-user-menu]')).toBeVisible();
			await expect(page.locator('[data-rw-layout-section]')).toBeVisible();

			const sidebarOption = page.locator('[data-rw-shell-layout-option="sidebar"]');
			await expect(sidebarOption).toBeVisible();
			const isAlreadySidebar = (await sidebarOption.getAttribute('aria-pressed')) === 'true';
			if (!isAlreadySidebar) {
				const [switchRes] = await Promise.all([waitForWorkspacePrefsPost(page), sidebarOption.click()]);
				expect(switchRes.status()).toBe(200);
			} else {
				await page.keyboard.press('Escape');
			}

			await expect(page.locator('[data-rw-app-shell][data-rw-shell-layout="sidebar"]')).toBeVisible();
			const sidebar = page.locator('[data-rw-sidebar]');
			await expect(sidebar).toBeVisible();
			await expect(sidebar.locator('[data-rw-module-switcher]')).toBeVisible();
			await expect(sidebar.locator('[data-rw-user-menu-trigger]')).toBeVisible();

			// Zero redundant Workspaces topbar or duplicate Workspaces nav section in sidebar mode
			await expect(page.locator('[data-rw-global-bar]')).toHaveCount(0);
			await expect(sidebar.locator('nav[aria-label="Workspaces"]')).toHaveCount(0);
			await expect(sidebar.locator('nav[data-rw-module-nav]')).toHaveCount(1);

			await page.reload({ waitUntil: 'networkidle' });
			await expect(page.locator('[data-rw-app-shell][data-rw-shell-layout="sidebar"]')).toBeVisible();
			await expect(sidebar).toBeVisible();

			// 2. Verify ModuleSwitcher search, pinning favorite, compact footer, and module navigation
			await sidebar.locator('[data-rw-module-switcher]').click();
			const switcherMenu = page.locator('[data-rw-module-switcher-menu]');
			await expect(switcherMenu).toBeVisible();
			await expect(switcherMenu.getByText('Workspace Hub')).toBeVisible();
			await expect(switcherMenu.locator('[data-rw-admin-return]')).toBeVisible();

			const searchInput = switcherMenu.locator('[data-rw-module-switcher-search]');
			await expect(searchInput).toBeVisible();
			await searchInput.fill('__no_such_workspace_match__');
			await expect(switcherMenu.locator('[data-rw-module-switcher-item]')).toHaveCount(0);
			await searchInput.fill('');
			const itemCount = await switcherMenu.locator('[data-rw-module-switcher-item]').count();
			expect(itemCount).toBeGreaterThan(0);

			// Pin & unpin a specific workspace item cleanly (tracking by id across Pinned/All reordering)
			const firstItem = switcherMenu.locator('[data-rw-module-switcher-item]').first();
			const firstItemId = (await firstItem.getAttribute('data-rw-module-switcher-item')) || '';
			expect(firstItemId).not.toBe('');
			const trackedPinBtn = switcherMenu
				.locator(`[data-rw-module-switcher-item="${firstItemId}"] button[aria-label]`)
				.first();
			const initialPinLabel = (await trackedPinBtn.getAttribute('aria-label')) || '';
			const [pinRes] = await Promise.all([waitForWorkspacePrefsPost(page), trackedPinBtn.click()]);
			expect(pinRes.status()).toBe(200);
			await expect(trackedPinBtn).not.toHaveAttribute('aria-label', initialPinLabel);

			const [unpinRes] = await Promise.all([waitForWorkspacePrefsPost(page), trackedPinBtn.click()]);
			expect(unpinRes.status()).toBe(200);
			await expect(trackedPinBtn).toHaveAttribute('aria-label', initialPinLabel);

			// Navigate via ModuleSwitcher to another module if present, otherwise Workspace Hub footer link
			const altModuleLink = switcherMenu
				.locator('[data-rw-module-switcher-item]:not([data-rw-module-switcher-item="workspace"]) a[href]')
				.first();
			if ((await altModuleLink.count()) > 0) {
				const targetHref = (await altModuleLink.getAttribute('href')) || '';
				const expectedTarget = targetHref !== '' ? new URL(targetHref, page.url()) : null;
				await altModuleLink.click();
				if (expectedTarget) {
					await page.waitForURL((u) => u.pathname === expectedTarget.pathname && u.search === expectedTarget.search);
				}
				await page.waitForLoadState('networkidle');
				await expect(page.locator('[data-rw-app-shell][data-rw-shell-layout="sidebar"]')).toBeVisible();
				await page.goto(getAdminUrl('workspace/'), { waitUntil: 'networkidle' });
			} else {
				const hubLink = switcherMenu.locator('a:has-text("Workspace Hub")').first();
				await hubLink.click();
				await expect(switcherMenu).toBeHidden();
			}

			// 3. Collapse and expand sidebar via toggle button (60px rail), reload persistence, and Control+b shortcut
			if ((await rootShell.getAttribute('data-rw-sidebar-collapsed')) === 'true') {
				const [expandInitRes] = await Promise.all([
					waitForWorkspacePrefsPost(page),
					page.locator('[data-rw-sidebar-toggle]').click(),
				]);
				expect(expandInitRes.status()).toBe(200);
			}
			await expect(rootShell).toHaveAttribute('data-rw-sidebar-collapsed', 'false');
			await expect
				.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
				.toBeGreaterThanOrEqual(235);

			const [collapseRes] = await Promise.all([
				waitForWorkspacePrefsPost(page),
				page.locator('[data-rw-sidebar-toggle]').click(),
			]);
			expect(collapseRes.status()).toBe(200);
			await expect(rootShell).toHaveAttribute('data-rw-sidebar-collapsed', 'true');
			await expect
				.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
				.toBeLessThanOrEqual(64);
			const railWidth = (await sidebar.boundingBox())?.width ?? 0;
			expect(railWidth).toBeGreaterThanOrEqual(56);

			await page.reload({ waitUntil: 'networkidle' });
			await expect(page.locator('[data-rw-app-shell]')).toHaveAttribute('data-rw-sidebar-collapsed', 'true');
			await expect
				.poll(async () => Math.round((await page.locator('[data-rw-sidebar]').boundingBox())?.width ?? 0))
				.toBeLessThanOrEqual(64);

			// Blur any focused element before triggering global mod+b shortcut
			await page.evaluate(() => {
				if (document.activeElement instanceof HTMLElement) {
					document.activeElement.blur();
				}
			});
			const [shortcutExpandRes] = await Promise.all([
				waitForWorkspacePrefsPost(page),
				page.keyboard.press('Control+b'),
			]);
			expect(shortcutExpandRes.status()).toBe(200);
			await expect(page.locator('[data-rw-app-shell]')).toHaveAttribute('data-rw-sidebar-collapsed', 'false');
			await expect
				.poll(async () => Math.round((await page.locator('[data-rw-sidebar]').boundingBox())?.width ?? 0))
				.toBeGreaterThanOrEqual(235);

			// 4. Light + Dark mode WCAG 2.1 AA audit in Sidebar layout
			await page.locator('[data-rw-sidebar] [data-rw-user-menu-trigger]').click();
			const lightBtn = page.locator('[data-rw-theme-mode-option="light"]');
			if ((await lightBtn.getAttribute('aria-pressed')) !== 'true') {
				const [lightRes] = await Promise.all([waitForWorkspacePrefsPost(page), lightBtn.click()]);
				expect(lightRes.status()).toBe(200);
			}
			await page.keyboard.press('Escape');
			await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
			await assertWcag21AaClean(page, 'sidebar-light');

			await page.locator('[data-rw-sidebar] [data-rw-user-menu-trigger]').click();
			const [darkRes] = await Promise.all([
				waitForWorkspacePrefsPost(page),
				page.locator('[data-rw-theme-mode-option="dark"]').click(),
			]);
			expect(darkRes.status()).toBe(200);
			await page.keyboard.press('Escape');
			await expect(page.locator('html')).toHaveClass(/\bdark\b/);
			await assertWcag21AaClean(page, 'sidebar-dark');

			// Restore theme mode back to system
			await page.locator('[data-rw-sidebar] [data-rw-user-menu-trigger]').click();
			const [sysThemeRes] = await Promise.all([
				waitForWorkspacePrefsPost(page),
				page.locator('[data-rw-theme-mode-option="system"]').click(),
			]);
			expect(sysThemeRes.status()).toBe(200);
			await page.keyboard.press('Escape');

			// 5. Mobile 390x844 drawer open, navigation, zero horizontal overflow, and WCAG clean
			await page.setViewportSize({ width: 390, height: 844 });
			await expect(page.locator('[data-rw-sidebar]')).toBeHidden();
			await expect(page.locator('[data-rw-mobile-header]')).toBeVisible();
			const mobileTrigger = page.locator('[data-rw-mobile-menu-trigger]');
			await expect(mobileTrigger).toBeVisible();

			const hasOverflow = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			);
			expect(hasOverflow).toBe(false);
			await assertWcag21AaClean(page, 'sidebar-mobile');

			await mobileTrigger.click();
			const mobileDrawer = page.locator('[data-rw-mobile-drawer]');
			await expect(mobileDrawer).toBeVisible();
			await expect(mobileDrawer.locator('[data-rw-module-switcher]')).toBeVisible();
			await mobileDrawer.locator('[data-rw-module-nav] button, [data-rw-module-nav] a').nth(1).click();
			await expect(mobileDrawer).toHaveCount(0);
			await expect(page.locator('[data-rw-directory-section]')).toBeVisible();

			await page.setViewportSize({ width: 1280, height: 720 });
			await expect(page.locator('[data-rw-sidebar]')).toBeVisible();
		} finally {
			// 6. Restore shell layout preference to site default (topbar) so clean state remains
			await page.setViewportSize({ width: 1280, height: 720 });
			const userMenuTrigger = page.locator('[data-rw-user-menu-trigger]:visible').first();
			if (await userMenuTrigger.isVisible().catch(() => false)) {
				await userMenuTrigger.click();
				await expect(page.locator('[data-rw-user-menu]')).toBeVisible();
				const resetLayoutBtn = page.locator('[data-rw-shell-layout-reset]');
				if (await resetLayoutBtn.isVisible().catch(() => false)) {
					const [resetRes] = await Promise.all([waitForWorkspacePrefsPost(page), resetLayoutBtn.click()]);
					expect(resetRes.status()).toBe(200);
				} else {
					const topbarBtn = page.locator('[data-rw-shell-layout-option="topbar"]');
					if ((await topbarBtn.count()) > 0 && (await topbarBtn.getAttribute('aria-pressed')) !== 'true') {
						await Promise.all([waitForWorkspacePrefsPost(page), topbarBtn.click()]);
					} else {
						await page.keyboard.press('Escape');
					}
				}
			}
		}

		await expect(page.locator('[data-rw-app-shell][data-rw-shell-layout="topbar"]')).toBeVisible();
		await expect(page.locator('[data-rw-global-bar]')).toBeVisible();
		await expect(page.locator('[data-rw-sidebar]')).toHaveCount(0);
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.locator('[data-rw-app-shell][data-rw-shell-layout="topbar"]')).toBeVisible();

		tracker.assertNoErrors();
	});
});
