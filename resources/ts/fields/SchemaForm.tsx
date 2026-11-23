import React from 'react';
import { t } from '../lib/i18n';
import { cn, sanitizeSameOriginUrl } from '../lib/utils';
import {
	Badge,
	Button,
	Card,
	PortalRoot,
	ResponsiveTabBar,
	type ResponsiveTabItem,
} from '../ui';
import { SubmitField } from './controls';
import {
	countNestedErrors,
	ensureNativeLanguageTabsBridge,
	lookupScopedFieldValue,
	resolveFieldState,
	resolveGridSpanClass,
	SearchableTabPanel,
} from './shared';
import type {
	InputfieldSubmitDropdownItem,
	SchemaFieldDefinition,
	SchemaFormProps,
} from './types';
import { valibot } from './validation';
import type { MediaCustomFieldRenderer } from './mediaUtils';
import { SchemaField } from './schema/SchemaField';
import { FieldControlIsland } from './schema/FieldControlIsland';
import {
	SchemaFormContext,
	useSchemaFormContext,
	type SchemaFormContextValue,
} from './schema/SchemaFormContext';
import {
	resolveTabPaneSlot,
	SchemaIslandNode,
	SchemaMarkupNode,
	SchemaSectionNode,
	SchemaTabsGroupNode,
} from './schema/SchemaLayoutNodes';
import { extractSchemaInitialValues } from './schema/schemaValueUtils';
import { useSchemaFormController } from './schema/useSchemaFormController';

export * from './types';
export * from './shared';
export * from './mediaUtils';
export * from './controls';
export * from './validation';
export { valibot };
export {
	SchemaFormContext,
	useSchemaFormContext,
	type SchemaFormContextValue,
};
export { extractSchemaInitialValues };
export { SchemaField };
export { FieldControlIsland };

export const SchemaForm: React.FC<SchemaFormProps> = (props) => {
	const {
		instanceId,
		containerRef,
		schema,
		scopePrefix,
		values,
		conditionValues,
		errors,
		topTabs,
		visibleTopTabs,
		rootFields,
		fieldsByName,
		submits,
		activeTopTabId,
		setActiveTopTabId,
		steps,
		isMultiStep,
		activeStepIndex,
		setActiveStepIndex,
		headButtonsTarget,
		isDirty,
		setIsDirtyLocal,
		isSubmitting,
		setSubmittingState,
		validateAll,
		validateStep,
		updateFieldValue,
		contextValue,
		handleSettingFieldChange,
		handleNamedSettingChange,
		resolveFieldAdornment,
		hasConfirmedDelete,
	} = useSchemaFormController(props);

	const renderFieldNode = (field: SchemaFieldDefinition, idx: number): React.ReactNode => {
		const fieldState = resolveFieldState(field, conditionValues, scopePrefix);
		if (!fieldState.visible) {
			return null;
		}

		const isDynamicallyRequired = fieldState.required;
		const isDynamicallyDisabled = fieldState.disabled;
		const spanClass = resolveGridSpanClass(field.width ?? field.columnWidth, field.colSpan);
		const key = field.id || field.name || `node_${idx}`;

		if (field.kind === 'tabs' || (Array.isArray(field.tabs) && field.tabs.length > 0)) {
			return (
				<div key={key} className={spanClass}>
					<SchemaTabsGroupNode
						field={field}
						values={conditionValues}
						errors={errors}
						scopePrefix={scopePrefix}
						tabSlots={props.tabSlots}
						renderFieldsGrid={renderFieldsGrid}
					/>
				</div>
			);
		}

		if (
			field.kind === 'section' ||
			(Array.isArray(field.fields) && field.fields.length > 0) ||
			(field.fields && typeof field.fields === 'object' && Object.keys(field.fields).length > 0) ||
			(Array.isArray(field.children) && field.children.length > 0)
		) {
			return (
				<div key={key} className={spanClass}>
					<SchemaSectionNode
						field={field}
						renderFieldsGrid={renderFieldsGrid}
						errors={errors}
					/>
				</div>
			);
		}

		if (field.kind === 'island' && field.component) {
			return (
				<div key={key} className={spanClass}>
					<SchemaIslandNode
						field={field}
						errorMessage={field.name ? errors[field.name] : undefined}
						formValues={values}
						conditionValues={conditionValues}
						allErrors={errors}
						isDynamicallyRequired={isDynamicallyRequired}
						isDynamicallyDisabled={isDynamicallyDisabled}
						scopePrefix={scopePrefix}
						fieldsByName={fieldsByName}
						adornment={resolveFieldAdornment(field.name)}
						onSettingFieldChange={handleSettingFieldChange}
						onNamedSettingChange={handleNamedSettingChange}
					/>
				</div>
			);
		}

		if (field.kind === 'markup') {
			return (
				<div key={key} className={spanClass}>
					<SchemaMarkupNode field={field} errorMessage={field.name ? errors[field.name] : undefined} />
				</div>
			);
		}

		const scopedLookup = field.name
			? lookupScopedFieldValue(values, field.name, scopePrefix)
			: { found: false, value: undefined };
		const isHiddenInlineSetting = Boolean(field.inlineHidden && !(field.name && errors[field.name]));

		return (
			<div
				key={key}
				className={isHiddenInlineSetting ? 'hidden' : spanClass}
				aria-hidden={isHiddenInlineSetting ? 'true' : undefined}
			>
				<SchemaField
					field={isHiddenInlineSetting ? { ...field, inlineSettings: undefined } : field}
					value={field.name in values ? values[field.name] : scopedLookup.found ? scopedLookup.value : undefined}
					formValues={values}
					conditionValues={conditionValues}
					allErrors={errors}
					errorMessage={field.name ? errors[field.name] : undefined}
					isDynamicallyRequired={isDynamicallyRequired}
					isDynamicallyDisabled={isDynamicallyDisabled}
					scopePrefix={scopePrefix}
					fieldsByName={fieldsByName}
					suppressInlineSettings={isHiddenInlineSetting}
					adornment={isHiddenInlineSetting ? undefined : resolveFieldAdornment(field.name)}
					onChange={(val) => updateFieldValue(field.name, val, field, scopePrefix)}
					onNamedChange={(targetName, val) => updateFieldValue(targetName, val, field, scopePrefix)}
					onSettingFieldChange={handleSettingFieldChange}
					onNamedSettingChange={handleNamedSettingChange}
				/>
			</div>
		);
	};

	function renderFieldsGrid(items: SchemaFieldDefinition[]): React.ReactNode {
		return (
			<div
				className={cn(
					'@container/rw-grid grid grid-cols-12',
					schema.isFragment ? 'gap-3 @lg/rw-grid:gap-3.5' : 'gap-3.5 @lg/rw-grid:gap-4'
				)}
			>
				{items.map((field, idx) => renderFieldNode(field, idx))}
			</div>
		);
	}

	const renderSubmitButtons = (isHeaderClone = false) => {
		const visibleSubmits = submits.filter(
			(sub) =>
				(!isHeaderClone || sub.header) &&
				resolveFieldState(sub, conditionValues, scopePrefix).visible
		);
		if (visibleSubmits.length === 0) {
			return null;
		}
		return (
			<div className="flex flex-wrap items-center gap-2">
				{visibleSubmits.map((sub) => {
					const subState = resolveFieldState(sub, conditionValues, scopePrefix);
					const dropdownItems: InputfieldSubmitDropdownItem[] = (sub.actions || []).map((a) => ({
						type: (a.type as 'value' | 'link' | undefined) ?? 'value',
						value: a.value,
						label: a.label,
						icon: a.icon,
					}));
					return (
						<SubmitField
							key={`${sub.id}_${isHeaderClone ? 'head' : 'foot'}`}
							controlType="submit"
							id={isHeaderClone ? `${sub.id}_head` : sub.id}
							name={sub.name}
							formId={isHeaderClone ? schema.id : undefined}
							value={sub.label}
							disabled={subState.disabled || isSubmitting}
							submit={{
								type: 'submit',
								value: sub.label,
								label: sub.label,
								icon: sub.icon,
								danger: sub.danger,
								small: isHeaderClone ? true : undefined,
								header: sub.header,
								dropdownInputName: '_action_value',
								dropdownSubmit: true,
								dropdownRequired: false,
								dropdownItems,
							}}
						/>
					);
				})}
			</div>
		);
	};

	const RuntimeEditPresenceBanner =
		typeof window !== 'undefined'
			? window.ReactWorkspaceRuntime?.Layout?.EditPresenceBanner
			: undefined;
	const resolvedPresenceKey = !schema.isFragment
		? (props.presenceKey ?? schema.presenceKey ?? null)
		: null;
	const resolvedPresenceEndpoint = !schema.isFragment
		? (props.presenceEndpoint ?? schema.presenceEndpoint ?? null)
		: null;
	const [isWideForVertical, setIsWideForVertical] = React.useState(true);
	const requestedTabsLayout = props.tabsLayout ?? schema.tabsLayout ?? 'horizontal';
	const useVerticalTopTabs =
		requestedTabsLayout === 'vertical' && visibleTopTabs.length > 1 && isWideForVertical;
	const useCardSurface =
		!schema.isFragment &&
		(props.card === true || props.surface === 'card' || schema.surface === 'card');
	const hasCardTabsAbove =
		useCardSurface && !useVerticalTopTabs && topTabs.length > 0 && visibleTopTabs.length > 1;
	const sanitizedInstanceId = instanceId.replace(/:/g, '');

	React.useEffect(() => {
		if (requestedTabsLayout !== 'vertical') {
			setIsWideForVertical(true);
			return;
		}
		const target = containerRef.current;
		if (!target || typeof window === 'undefined') {
			setIsWideForVertical(true);
			return;
		}
		const update = () => {
			const width = target.clientWidth;
			setIsWideForVertical(width <= 0 || width >= 768);
		};
		update();
		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(() => update());
			ro.observe(target);
			return () => ro.disconnect();
		}
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	}, [requestedTabsLayout, containerRef]);

	const buildTopTabItems = (): ResponsiveTabItem[] =>
		visibleTopTabs.map((tab) => ({
			id: tab.id,
			btnId: `rw-toptab-${sanitizedInstanceId}-${tab.id}`,
			label: tab.label,
			icon: tab.icon,
			badge: tab.badge,
			errorCount: countNestedErrors(tab.fields || [], errors),
			confirmDelete: Boolean(tab.confirmDelete),
		}));

	const renderTopTablist = (mode: 'aboveCard' | 'plain' | 'vertical'): React.ReactNode => {
		if (visibleTopTabs.length <= 1) {
			return null;
		}
		return (
			<ResponsiveTabBar
				items={buildTopTabItems()}
				activeId={activeTopTabId}
				ariaLabel={schema.name || 'Sections'}
				variant={mode === 'vertical' ? 'vertical' : 'line'}
				aboveCard={mode === 'aboveCard'}
				compact={mode !== 'vertical' && Boolean(schema.isFragment)}
				formLayout={mode === 'vertical'}
				onSelect={(id) => setActiveTopTabId(id)}
			/>
		);
	};

	const renderTopTabPanels = (): React.ReactNode => {
		if (topTabs.length === 0) {
			return null;
		}
		return (
			<div>
				{topTabs.map((tab) => {
					const isVisible = resolveFieldState(tab, conditionValues, scopePrefix).visible;
					const isActive = isVisible && tab.id === activeTopTabId;
					const topTabBtnId = `rw-toptab-${instanceId.replace(/:/g, '')}-${tab.id}`;
					const tabSlot = resolveTabPaneSlot(props.tabSlots, tab);
					return (
						<SearchableTabPanel
							key={tab.id}
							id={tab.id}
							labelledBy={topTabBtnId}
							isActive={isActive}
							searchableWhenHidden={isVisible}
							onRevealMatch={() => setActiveTopTabId(tab.id)}
						>
							<div className={schema.isFragment ? 'space-y-3.5' : 'space-y-4'}>
								{tabSlot?.before}
								{tab.description ? (
									<p className="text-xs text-muted-foreground">{tab.description}</p>
								) : null}
								{renderFieldsGrid(tab.fields || [])}
								{tabSlot?.after}
								{tab.notes ? (
									<p className="text-[11px] text-muted-foreground">{tab.notes}</p>
								) : null}
							</div>
						</SearchableTabPanel>
					);
				})}
			</div>
		);
	};

	const rootFieldsNode =
		rootFields.length > 0 ? (
			isMultiStep ? (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
						{steps.map((step, sIdx) => {
							const isCurrent = step.index === activeStepIndex;
							const stepErrCount = countNestedErrors(step.fields, errors);
							return (
								<button
									key={step.index}
									type="button"
									onClick={() => {
										if (step.index > activeStepIndex && props.validateOnSubmit !== false) {
											const stepCheck = validateStep(activeStepIndex);
											if (!stepCheck.valid) {
												return;
											}
										}
										setActiveStepIndex(step.index);
									}}
									className={cn(
										'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
										isCurrent
											? 'bg-primary text-primary-foreground'
											: 'bg-muted text-muted-foreground hover:text-foreground'
									)}
								>
									<span className="font-mono text-[11px]">{sIdx + 1}.</span>
									<span>{step.title}</span>
									{stepErrCount > 0 ? <Badge variant="destructive">{stepErrCount}</Badge> : null}
								</button>
							);
						})}
					</div>

					{steps.map((step) => (
						<div
							key={step.index}
							className={cn(step.index !== activeStepIndex && 'hidden')}
						>
							{renderFieldsGrid(step.fields)}
						</div>
					))}

					<div className="flex items-center justify-between pt-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={activeStepIndex <= (steps[0]?.index ?? 0)}
							onClick={() => {
								const curPos = steps.findIndex((s) => s.index === activeStepIndex);
								const prevStep = curPos > 0 ? steps[curPos - 1] : undefined;
								if (prevStep) {
									setActiveStepIndex(prevStep.index);
								}
							}}
						>
							{t('form.previousStep', 'Previous')}
						</Button>
						{activeStepIndex < (steps[steps.length - 1]?.index ?? -1) ? (
							<Button
								type="button"
								size="sm"
								onClick={() => {
									if (props.validateOnSubmit !== false) {
										const stepCheck = validateStep(activeStepIndex);
										if (!stepCheck.valid) {
											return;
										}
									}
									const curPos = steps.findIndex((s) => s.index === activeStepIndex);
									const nextStep = curPos >= 0 ? steps[curPos + 1] : undefined;
									if (nextStep) {
										setActiveStepIndex(nextStep.index);
									}
								}}
							>
								{t('form.nextStep', 'Next Step')}
							</Button>
						) : null}
					</div>
				</div>
			) : (
				renderFieldsGrid(rootFields)
			)
		) : null;

	const fieldsAndTabsContent = useCardSurface ? (
		useVerticalTopTabs ? (
			<div className="@container/rw-form min-w-0">
				<Card data-rw-form-card="" data-rw-tabs-layout="vertical" className="p-0">
					<div className="flex min-w-0">
						<aside className="w-56 shrink-0 rounded-s-xl border-r border-border bg-muted/20 p-2">
							<div className="sticky top-4">{renderTopTablist('vertical')}</div>
						</aside>
						<div className="min-w-0 flex-1 p-5 space-y-5">
							{renderTopTabPanels()}
							{rootFieldsNode}
						</div>
					</div>
				</Card>
			</div>
		) : (
			<div className={cn('@container/rw-form min-w-0', hasCardTabsAbove && 'space-y-0')}>
				{hasCardTabsAbove ? renderTopTablist('aboveCard') : null}
				<Card
					data-rw-form-card=""
					className={cn(
						'p-5 space-y-5',
						hasCardTabsAbove && 'rounded-t-none rounded-b-xl border-t-0'
					)}
				>
					{renderTopTabPanels()}
					{rootFieldsNode}
				</Card>
			</div>
		)
	) : useVerticalTopTabs ? (
		<div
			data-rw-tabs-layout="vertical"
			className="@container/rw-form min-w-0 flex items-start gap-6"
		>
			<aside className="w-52 shrink-0 sticky top-4 border-r border-border pr-3">
				{renderTopTablist('vertical')}
			</aside>
			<div className="min-w-0 flex-1 space-y-5">
				{renderTopTabPanels()}
				{rootFieldsNode}
			</div>
		</div>
	) : (
		<>
			{topTabs.length > 0 ? (
				<div className={cn('@container/rw-form min-w-0', schema.isFragment ? 'space-y-3.5' : 'space-y-5')}>
					{renderTopTablist('plain')}
					{renderTopTabPanels()}
				</div>
			) : null}
			{rootFieldsNode}
		</>
	);

	const hasPortaledHeadButtons = Boolean(headButtonsTarget && submits.some((s) => s.header));

	const bodyContent = (
		<>
			{resolvedPresenceKey && RuntimeEditPresenceBanner ? (
				<RuntimeEditPresenceBanner
					resourceKey={resolvedPresenceKey}
					endpoint={resolvedPresenceEndpoint}
					dirty={Boolean(isDirty)}
				/>
			) : null}

			{schema.csrf ? (
				<input type="hidden" name={schema.csrf.name} value={schema.csrf.value} />
			) : null}

			{(schema.hiddenInputs || []).map((h, i) => (
				<input
					key={`${h.name}_${i}`}
					type="hidden"
					id={h.id || undefined}
					name={h.name}
					value={h.value}
				/>
			))}

			{fieldsAndTabsContent}

			{!schema.isFragment &&
			!(props.hideFooterWhenPortaled && hasPortaledHeadButtons) &&
			(submits.length > 0 || (props.onSubmit && props.submitLabel)) ? (
				<div
					data-rw-form-actions=""
					className={cn(
						'flex flex-wrap items-center justify-start gap-3',
						useCardSurface ? 'pt-1' : 'border-t border-border pt-4'
					)}
				>
					{submits.length > 0 ? (
						renderSubmitButtons(false)
					) : props.onSubmit && props.submitLabel ? (
						<Button type="submit" icon="save" disabled={isSubmitting}>
							{props.submitLabel}
						</Button>
					) : null}
				</div>
			) : null}

			{hasPortaledHeadButtons ? (
				<PortalRoot container={headButtonsTarget} ssrFallback={false}>
					{renderSubmitButtons(true)}
				</PortalRoot>
			) : null}
		</>
	);

	const wrappedContent = (
		<SchemaFormContext.Provider value={contextValue}>
			{bodyContent}
		</SchemaFormContext.Provider>
	);

	if (schema.isFragment) {
		return (
			<div
				ref={(el) => {
					containerRef.current = el;
				}}
				className={cn('space-y-4', props.className)}
				data-rw-schema-fragment=""
				data-rw-scope-prefix={scopePrefix || undefined}
			>
				{wrappedContent}
			</div>
		);
	}

	const safeFormAction = sanitizeSameOriginUrl(schema.action || './') || './';

	return (
		<form
			ref={(el) => {
				containerRef.current = el;
			}}
			id={schema.id}
			name={schema.name}
			action={safeFormAction}
			method={schema.method || 'post'}
			encType={schema.encType || undefined}
			noValidate={props.validateOnSubmit !== false}
			onSubmit={(e) => {
				const submitter = (e.nativeEvent as SubmitEvent).submitter as
					| HTMLButtonElement
					| HTMLInputElement
					| null;
				const isBypassValidation = Boolean(
					hasConfirmedDelete ||
						(submitter?.name && /delete|discard|restore_revision/i.test(submitter.name)) ||
						submitter?.hasAttribute('formnovalidate') ||
						e.currentTarget.getAttribute('data-rw-skip-validate') === '1'
				);
				if (props.validateOnSubmit !== false && !isBypassValidation) {
					const check = validateAll();
					if (!check.valid) {
						setSubmittingState(false);
						if (visibleTopTabs.length > 1) {
							const activeTab = visibleTopTabs.find((tab) => tab.id === activeTopTabId);
							const activeTabErrors = activeTab ? countNestedErrors(activeTab.fields || [], check.errors) : 0;
							if (activeTabErrors === 0) {
								const firstTabWithErrors = visibleTopTabs.find(
									(tab) => countNestedErrors(tab.fields || [], check.errors) > 0
								);
								if (firstTabWithErrors) {
									setActiveTopTabId(firstTabWithErrors.id);
								}
							}
						}
						e.preventDefault();
						e.stopPropagation();
						return;
					}
				}
				setSubmittingState(true);
				if (props.onSubmit) {
					e.preventDefault();
					let pendingSubmit: unknown;
					try {
						pendingSubmit = props.onSubmit(values, e.currentTarget);
					} catch (submitErr) {
						setSubmittingState(false);
						throw submitErr;
					}
					if (pendingSubmit && typeof (pendingSubmit as Promise<unknown>).finally === 'function') {
						void (pendingSubmit as Promise<unknown>).finally(() => {
							setSubmittingState(false);
						});
					} else {
						setSubmittingState(false);
					}
					return;
				}
				const inertiaRuntime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime?.Inertia : undefined;
				const inertiaRouter = inertiaRuntime?.router;
				const hasInertiaApp =
					typeof inertiaRuntime?.isInertiaAppActive === 'function'
						? inertiaRuntime.isInertiaAppActive()
						: typeof document !== 'undefined' && Boolean(document.getElementById('app')?.getAttribute('data-page'));
				if (inertiaRouter && hasInertiaApp) {
					e.preventDefault();
					const formEl = e.currentTarget;
					const formData = new FormData(formEl);
					if (submitter && submitter.name && !formData.has(submitter.name)) {
						formData.append(submitter.name, submitter.value || '1');
					} else if (!submitter && submits[0]?.name && !formData.has(submits[0].name)) {
						formData.append(submits[0].name, submits[0].label || '1');
					}
					const method = (schema.method || 'post').toLowerCase();
					const rawAction = safeFormAction;
					const targetUrl =
						rawAction === './' || rawAction === ''
							? window.location.pathname + window.location.search
							: rawAction;
					const resetSubmitting = () => {
						setSubmittingState(false);
					};
					const handleSavedSuccess = () => {
						setIsDirtyLocal(false);
						if (resolvedPresenceKey && typeof window !== 'undefined') {
							window.dispatchEvent(
								new CustomEvent('rw:schema-form-saved', {
									detail: { resourceKey: resolvedPresenceKey },
								})
							);
						}
					};
					if (method === 'get') {
						const params: Record<string, string> = {};
						formData.forEach((v, k) => {
							if (typeof v === 'string') {
								params[k] = v;
							}
						});
						inertiaRouter.get(targetUrl, params, {
							preserveScroll: true,
							preserveState: false,
							onSuccess: handleSavedSuccess,
							onFinish: resetSubmitting,
							onError: resetSubmitting,
							onCancel: resetSubmitting,
						});
					} else {
						inertiaRouter.post(targetUrl, formData, {
							forceFormData: true,
							preserveScroll: true,
							preserveState: false,
							onSuccess: handleSavedSuccess,
							onFinish: resetSubmitting,
							onError: resetSubmitting,
							onCancel: resetSubmitting,
						});
					}
					return;
				}
				if (typeof window !== 'undefined') {
					window.queueMicrotask(() => {
						if (e.defaultPrevented) {
							setSubmittingState(false);
						}
					});
				}
			}}
			className={cn(useCardSurface ? 'space-y-4' : 'space-y-5', props.className)}
			data-rw-schema-form={schema.id}
		>
			{wrappedContent}
		</form>
	);
};

const schemaMediaCustomFieldRenderer: MediaCustomFieldRenderer = ({
	field,
	value,
	values,
	onChange,
	disabled,
}) => (
	<SchemaField
		field={disabled ? { ...field, disabled: true, readOnly: true } : field}
		value={value}
		formValues={values}
		onChange={(nextVal) => onChange(field.name, nextVal)}
		onNamedChange={(targetName, nextVal) => onChange(targetName, nextVal)}
	/>
);

if (typeof window !== 'undefined') {
	window.ReactWorkspaceRuntime?.__setMediaCustomFieldRenderer?.(schemaMediaCustomFieldRenderer);
	ensureNativeLanguageTabsBridge();
}
