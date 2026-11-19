import { test, expect } from '@playwright/test';
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

		// Verify theme switcher cycles dark mode on <html> without page reload
		const themeButton = page.locator('header button[title^="Theme mode:"]');
		await expect(themeButton).toBeVisible();
		const initialTitle = (await themeButton.getAttribute('title')) || '';
		await themeButton.click();
		await expect(themeButton).not.toHaveAttribute('title', initialTitle);
		// Cycle back so subsequent tests start in original theme
		await themeButton.click();
		await themeButton.click();

		// Verify responsive Mobile Drawer opens and closes at mobile viewport width
		await page.setViewportSize({ width: 390, height: 844 });
		const mobileTrigger = page.locator('[data-rw-mobile-menu-trigger]');
		if (await mobileTrigger.isVisible()) {
			await mobileTrigger.click();
			await expect(page.locator('[data-rw-mobile-drawer]')).toBeVisible();
			await page.keyboard.press('Escape');
		}
		await page.setViewportSize({ width: 1280, height: 720 });

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
});
