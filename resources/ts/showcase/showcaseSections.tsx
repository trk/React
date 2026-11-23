import { getReactWorkspaceRuntime } from '../runtime';
import type { ShowcaseFixtures } from './showcaseFixtures';

const runtime = getReactWorkspaceRuntime();
const { React, UI, Fields, Viewports, cn, DynamicIcon } = runtime;
const { useState } = React;
const {
	Alert,
	AlertDescription,
	AlertTitle,
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CliBox,
	CodePreview,
	CopyValueButton,
	Dialog,
	EmptyState,
	Menu,
	MenuContent,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
	Progress,
	Skeleton,
	StatCard,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} = UI;

const { SchemaForm, FileFieldControl, ImageFieldControl, LinkFieldControl, RelationFieldControl } = Fields;
const { DataViewport } = Viewports;

function CaseCard({
	caseId,
	title,
	badge,
	description,
	className,
	children,
}: {
	caseId: string;
	title: string;
	badge?: string;
	description?: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Card data-rw-showcase-case={caseId} className={cn('min-w-0 overflow-visible', className)}>
			<CardHeader className="pb-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<CardTitle className="text-sm font-semibold">{title}</CardTitle>
					{badge ? (
						<Badge variant="outline" className="font-mono text-[10px] shrink-0">
							{badge}
						</Badge>
					) : null}
				</div>
				{description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
			</CardHeader>
			<CardContent className="min-w-0 space-y-3">{children}</CardContent>
		</Card>
	);
}

function SectionHeading({
	id,
	title,
	subtitle,
	icon,
}: {
	id: string;
	title: string;
	subtitle: string;
	icon: string;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2.5">
			<div className="flex items-start gap-2.5 min-w-0">
				<span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<DynamicIcon name={icon} className="size-4" />
				</span>
				<div className="min-w-0">
					<h2 id={id} className="text-base font-semibold tracking-tight text-foreground">
						{title}
					</h2>
					<p className="text-xs text-muted-foreground">{subtitle}</p>
				</div>
			</div>
		</div>
	);
}

export function MediaShowcaseSection({ fixtures }: { fixtures: ShowcaseFixtures }) {
	return (
		<section data-rw-showcase-section="media" aria-labelledby="rw-sec-media" className="space-y-4">
			<SectionHeading
				id="rw-sec-media"
				icon="image"
				title="Media Fields (Image & File — 0 / 1 / Multi)"
				subtitle="Single-item vs multi-item layouts, grid & table/list views, long filenames, bilingual metadata, read-only, and error states."
			/>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="media-image-single-empty" title="ImageField · Single (0 items)" badge="maxFiles=1 · empty">
					<ImageFieldControl
						controlType="image"
						id="sc_img_single_empty"
						name="sc_img_single_empty"
						label="Cover Image"
						maxFiles={1}
						extensions={['jpg', 'jpeg', 'png', 'webp', 'svg']}
						accept=".jpg,.jpeg,.png,.webp,.svg"
						files={[]}
					/>
				</CaseCard>

				<CaseCard caseId="media-image-single-populated" title="ImageField · Single (1 item + EN/TR metadata)" badge="maxFiles=1 · 1 item">
					<ImageFieldControl
						controlType="image"
						id="sc_img_single_pop"
						name="sc_img_single_pop"
						label="Hero Image"
						maxFiles={1}
						descriptionRows={2}
						useTags={true}
						focusMode="on"
						extensions={['jpg', 'png', 'webp']}
						languages={fixtures.languages}
						files={fixtures.media.imageSinglePopulated}
					/>
				</CaseCard>

				<CaseCard caseId="media-image-multi-one" title="ImageField · Multi with 1 Item (Height & Chrome Check)" badge="maxFiles=0 · 1 item">
					<ImageFieldControl
						controlType="image"
						id="sc_img_multi_one"
						name="sc_img_multi_one"
						label="Gallery (Single Entry)"
						maxFiles={0}
						gridMode="grid"
						descriptionRows={2}
						useTags={true}
						languages={fixtures.languages}
						files={fixtures.media.imageMultiSingleItem}
					/>
				</CaseCard>

				<CaseCard caseId="media-image-multi-table" title="ImageField · Multi Table View (4 Items)" badge="maxFiles=0 · table">
					<ImageFieldControl
						controlType="image"
						id="sc_img_multi_table"
						name="sc_img_multi_table"
						label="Asset Table"
						maxFiles={0}
						gridMode="table"
						descriptionRows={2}
						useTags={true}
						files={fixtures.media.imageMultiFourItems}
					/>
				</CaseCard>
			</div>

			<CaseCard caseId="media-image-multi-grid" title="ImageField · Multi Grid View (4 Mixed Ratios)" badge="maxFiles=0 · grid · 4 items">
				<ImageFieldControl
					controlType="image"
					id="sc_img_multi_grid"
					name="sc_img_multi_grid"
					label="Editorial Gallery Grid"
					maxFiles={0}
					gridMode="grid"
					gridRatio="16:9"
					descriptionRows={2}
					useTags={true}
					focusMode="on"
					languages={fixtures.languages}
					files={fixtures.media.imageMultiFourItems}
				/>
			</CaseCard>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="media-file-single-empty" title="FileField · Single (0 items)" badge="maxFiles=1 · empty">
					<FileFieldControl
						controlType="file"
						id="sc_file_single_empty"
						name="sc_file_single_empty"
						label="Technical Attachment"
						maxFiles={1}
						extensions={['pdf', 'docx', 'zip']}
						accept=".pdf,.docx,.zip"
						files={[]}
					/>
				</CaseCard>

				<CaseCard caseId="media-file-single-populated" title="FileField · Single (1 populated PDF)" badge="maxFiles=1 · 1 item">
					<FileFieldControl
						controlType="file"
						id="sc_file_single_pop"
						name="sc_file_single_pop"
						label="Specification Document"
						maxFiles={1}
						descriptionRows={2}
						useTags={true}
						languages={fixtures.languages}
						files={fixtures.media.fileSinglePopulated}
					/>
				</CaseCard>

				<CaseCard caseId="media-file-multi-one" title="FileField · Multi with 1 File" badge="maxFiles=0 · 1 item">
					<FileFieldControl
						controlType="file"
						id="sc_file_multi_one"
						name="sc_file_multi_one"
						label="Downloads"
						maxFiles={0}
						descriptionRows={1}
						useTags={true}
						files={fixtures.media.fileMultiSingleItem}
					/>
				</CaseCard>

				<CaseCard caseId="media-file-multi-grid" title="FileField · Multi Grid View (4 Files)" badge="maxFiles=0 · grid · 4 items">
					<FileFieldControl
						controlType="file"
						id="sc_file_multi_grid"
						name="sc_file_multi_grid"
						label="Document Cards"
						maxFiles={0}
						gridMode="grid"
						descriptionRows={2}
						useTags={true}
						files={fixtures.media.fileMultiFourItems}
					/>
				</CaseCard>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="media-file-multi-table" title="FileField · Multi Table View (4 Files)" badge="maxFiles=0 · table">
					<FileFieldControl
						controlType="file"
						id="sc_file_multi_table"
						name="sc_file_multi_table"
						label="Archive Table"
						maxFiles={0}
						gridMode="table"
						descriptionRows={2}
						useTags={true}
						files={fixtures.media.fileMultiFourItems}
					/>
				</CaseCard>

				<CaseCard caseId="media-states-ro-error" title="Media Read-Only & Validation Error States" badge="readOnly + error">
					<div className="space-y-4">
						<ImageFieldControl
							controlType="image"
							id="sc_img_readonly"
							name="sc_img_readonly"
							label="Locked Image"
							maxFiles={1}
							readOnly={true}
							files={fixtures.media.imageSinglePopulated}
						/>
						<FileFieldControl
							controlType="file"
							id="sc_file_error"
							name="sc_file_error"
							label="Required Contract"
							maxFiles={1}
							required={true}
							error="At least one signed PDF document must be attached before publishing."
							files={[]}
						/>
					</div>
				</CaseCard>
			</div>
		</section>
	);
}

export function LinksShowcaseSection({ fixtures }: { fixtures: ShowcaseFixtures }) {
	const s = fixtures.links.schemas;
	return (
		<section data-rw-showcase-section="links" aria-labelledby="rw-sec-links" className="space-y-4">
			<SectionHeading
				id="rw-sec-links"
				icon="link-2"
				title="LinkField Matrix (All Types · Empty & Populated)"
				subtitle="URL, Page, Entry, Image, Video, File, Email, Phone, Anchor, Polymorphic switcher, read-only badges, and inline option chips."
			/>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="link-url-empty" title="URL Link · Empty" badge="type=url · empty">
					<SchemaForm schema={s.urlEmpty} />
				</CaseCard>
				<CaseCard caseId="link-url-populated" title="URL Link · Populated + EN/TR" badge="type=url · full">
					<SchemaForm schema={s.urlPopulated} />
				</CaseCard>

				<CaseCard caseId="link-page-empty" title="Page Link · Empty" badge="type=page · empty">
					<SchemaForm schema={s.pageEmpty} />
				</CaseCard>
				<CaseCard caseId="link-page-populated" title="Page Link · Populated" badge="type=page · full">
					<SchemaForm schema={s.pagePopulated} />
				</CaseCard>

				<CaseCard caseId="link-entry-empty" title="Entry Link · Empty" badge="type=entry · empty">
					<SchemaForm schema={s.entryEmpty} />
				</CaseCard>
				<CaseCard caseId="link-entry-populated" title="Entry Link · Populated" badge="type=entry · full">
					<SchemaForm schema={s.entryPopulated} />
				</CaseCard>

				<CaseCard caseId="link-image-empty" title="Media Link: Image · Empty" badge="type=image · empty">
					<SchemaForm schema={s.imageEmpty} />
				</CaseCard>
				<CaseCard caseId="link-image-populated" title="Media Link: Image · Populated" badge="type=image · full">
					<SchemaForm schema={s.imagePopulated} />
				</CaseCard>

				<CaseCard caseId="link-video-empty" title="Media Link: Video · Empty" badge="type=video · empty">
					<SchemaForm schema={s.videoEmpty} />
				</CaseCard>
				<CaseCard caseId="link-video-populated" title="Media Link: Video · Populated" badge="type=video · full">
					<SchemaForm schema={s.videoPopulated} />
				</CaseCard>

				<CaseCard caseId="link-file-empty" title="Media Link: File · Empty" badge="type=file · empty">
					<SchemaForm schema={s.fileEmpty} />
				</CaseCard>
				<CaseCard caseId="link-file-populated" title="Media Link: File · Populated" badge="type=file · full">
					<SchemaForm schema={s.filePopulated} />
				</CaseCard>

				<CaseCard caseId="link-email-empty" title="Email Link · Empty" badge="type=email · empty">
					<SchemaForm schema={s.emailEmpty} />
				</CaseCard>
				<CaseCard caseId="link-email-populated" title="Email Link · Populated" badge="type=email · full">
					<SchemaForm schema={s.emailPopulated} />
				</CaseCard>

				<CaseCard caseId="link-tel-empty" title="Phone Link · Empty" badge="type=tel · empty">
					<SchemaForm schema={s.telEmpty} />
				</CaseCard>
				<CaseCard caseId="link-tel-populated" title="Phone Link · Populated" badge="type=tel · full">
					<SchemaForm schema={s.telPopulated} />
				</CaseCard>

				<CaseCard caseId="link-anchor" title="Anchor Fragment & All-Types Switcher" badge="anchor + polymorphic">
					<div className="space-y-4">
						<SchemaForm schema={s.anchorPopulated} />
						<SchemaForm schema={s.polymorphicAll} />
					</div>
				</CaseCard>

				<CaseCard caseId="link-readonly-error" title="Link Read-Only & Error States" badge="readOnly + error">
					<div className="space-y-4">
						<div className="flex flex-wrap items-center gap-2">
							<LinkFieldControl {...(fixtures.links.readonlyUrlField as Record<string, unknown>)} />
							<LinkFieldControl {...(fixtures.links.readonlyImageField as Record<string, unknown>)} />
						</div>
						<SchemaForm schema={s.errorLink} />
					</div>
				</CaseCard>
			</div>
		</section>
	);
}

export function RelationsShowcaseSection({ fixtures }: { fixtures: ShowcaseFixtures }) {
	const r = fixtures.relations;
	return (
		<section data-rw-showcase-section="relations" aria-labelledby="rw-sec-relations" className="space-y-4">
			<SectionHeading
				id="rw-sec-relations"
				icon="git-branch"
				title="Relation Fields (M2O · M2M · O2M · M2A)"
				subtitle="Select, Autocomplete, Radio & Radio Cards, TreeSelect, MultiSelect, Checkboxes, Transfer, Picker Drawer, O2M Subtable & Cards, and Polymorphic M2A."
			/>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="rel-m2o-select" title="M2O Select (Empty & Populated)" badge="m2o · select">
					<div className="space-y-3">
						<RelationFieldControl
							cardinality="m2o"
							widget="select"
							name="sc_m2o_sel_empty"
							placeholder="Choose category..."
							relationToken=""
							initialOptions={r.m2oOptions}
							value=""
						/>
						<RelationFieldControl
							cardinality="m2o"
							widget="select"
							name="sc_m2o_sel_pop"
							relationToken=""
							initialOptions={r.m2oOptions}
							selectedItems={[r.m2oSelected]}
							value={r.m2oSelected.value}
						/>
					</div>
				</CaseCard>

				<CaseCard caseId="rel-m2o-autocomplete" title="M2O Autocomplete (Empty & Populated Card)" badge="m2o · autocomplete">
					<div className="space-y-3">
						<RelationFieldControl
							cardinality="m2o"
							widget="autocomplete"
							name="sc_m2o_ac_empty"
							placeholder="Search sectors..."
							creatable={true}
							relationToken=""
							value=""
						/>
						<RelationFieldControl
							cardinality="m2o"
							widget="autocomplete"
							name="sc_m2o_ac_pop"
							relationToken=""
							selectedItems={[r.m2oSelected]}
							value={r.m2oSelected.value}
						/>
					</div>
				</CaseCard>

				<CaseCard caseId="rel-m2o-radios" title="M2O Radio Cards & Hierarchical TreeSelect" badge="m2o · radio-cards + tree">
					<div className="space-y-4">
						<RelationFieldControl
							cardinality="m2o"
							widget="radio-cards"
							name="sc_m2o_radiocards"
							optionColumns={2}
							relationToken=""
							initialOptions={r.m2oOptions}
							value="102"
						/>
						<RelationFieldControl
							cardinality="m2o"
							widget="treeselect"
							name="sc_m2o_tree"
							relationToken=""
							initialTree={r.m2oTree}
							selectedItems={[r.m2oSelected]}
							value="101"
						/>
					</div>
				</CaseCard>

				<CaseCard caseId="rel-m2m-multiselect" title="M2M MultiSelect (0, 1 & 4 Sortable Items)" badge="m2m · multiselect">
					<div className="space-y-3">
						<RelationFieldControl
							cardinality="m2m"
							widget="multiselect"
							name="sc_m2m_empty"
							relationToken=""
							initialOptions={r.m2mOptions}
							value={[]}
						/>
						<RelationFieldControl
							cardinality="m2m"
							widget="multiselect"
							name="sc_m2m_pop4"
							sortable={true}
							relationToken=""
							initialOptions={r.m2mOptions}
							selectedItems={r.m2mSelectedFour}
							value={r.m2mSelectedFour.map((item) => item.value)}
						/>
					</div>
				</CaseCard>

				<CaseCard caseId="rel-m2m-checkboxes-picker" title="M2M Checkboxes (2-Col) & Picker Drawer" badge="m2m · checkboxes + picker">
					<div className="space-y-4">
						<RelationFieldControl
							cardinality="m2m"
							widget="checkboxes"
							name="sc_m2m_checks"
							optionColumns={2}
							relationToken=""
							initialOptions={r.m2mOptions.slice(0, 4)}
							value={['101', '104']}
						/>
						<RelationFieldControl
							cardinality="m2m"
							widget="picker"
							name="sc_m2m_picker"
							sortable={true}
							relationToken=""
							selectedItems={r.m2mSelectedFour.slice(0, 3)}
							value={r.m2mSelectedFour.slice(0, 3).map((item) => item.value)}
						/>
					</div>
				</CaseCard>

				<CaseCard caseId="rel-m2m-transfer" title="M2M Dual-List Transfer Widget" badge="m2m · transfer">
					<RelationFieldControl
						cardinality="m2m"
						widget="transfer"
						name="sc_m2m_transfer"
						relationToken=""
						initialOptions={r.m2mOptions}
						selectedItems={r.m2mSelectedOne}
						value={['101']}
					/>
				</CaseCard>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="rel-o2m-subtable" title="O2M Subtable (Empty & 3 Child Rows)" badge="o2m · subtable">
					<div className="space-y-4">
						<RelationFieldControl
							cardinality="o2m"
							widget="subtable"
							name="sc_o2m_empty"
							resource="milestone"
							resourceLabel="Milestone"
							resourceIcon="flag"
							ownerId="showcase_1"
							foreignField="project_id"
							relationToken=""
							creatable={false}
							allowLink={true}
							allowUnlink={true}
							selectedItems={[]}
						/>
						<RelationFieldControl
							cardinality="o2m"
							widget="subtable"
							name="sc_o2m_pop"
							resource="milestone"
							resourceLabel="Milestone"
							resourceIcon="flag"
							ownerId="showcase_1"
							foreignField="project_id"
							relationToken=""
							creatable={false}
							allowLink={true}
							allowUnlink={true}
							selectedItems={r.o2mChildren}
						/>
					</div>
				</CaseCard>

				<CaseCard caseId="rel-o2m-cards" title="O2M Cards Grid View (3 Children)" badge="o2m · cards">
					<RelationFieldControl
						cardinality="o2m"
						widget="cards"
						name="sc_o2m_cards"
						resource="milestone"
						resourceLabel="Milestone"
						resourceIcon="flag"
						ownerId="showcase_1"
						foreignField="project_id"
						relationToken=""
						creatable={false}
						allowLink={true}
						allowUnlink={true}
						selectedItems={r.o2mChildren}
					/>
				</CaseCard>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="rel-m2a-morph" title="M2A Polymorphic Relations (Empty & Mixed Resources)" badge="m2a · morph">
					<div className="space-y-4">
						<RelationFieldControl
							cardinality="m2a"
							widget="morph"
							name="sc_m2a_empty"
							multiple={true}
							relationToken=""
							resources={r.m2aResources}
							allowedResources={['page', 'article', 'asset']}
							value={[]}
						/>
						<RelationFieldControl
							cardinality="m2a"
							widget="morph"
							name="sc_m2a_pop"
							multiple={true}
							sortable={true}
							relationToken=""
							resources={r.m2aResources}
							allowedResources={['page', 'article', 'asset']}
							selectedItems={r.m2aSelectedThree}
							value={r.m2aSelectedThree.map((item) => item.key)}
						/>
					</div>
				</CaseCard>

				<CaseCard caseId="rel-readonly-states" title="Relation Read-Only Presentations" badge="readOnly">
					<div className="space-y-3">
						<div>
							<p className="mb-1 text-xs font-medium text-muted-foreground">M2O Read-Only</p>
							<RelationFieldControl
								cardinality="m2o"
								name="sc_rel_ro_m2o"
								readOnly={true}
								relationToken=""
								selectedItems={[r.m2oSelected]}
								value={r.m2oSelected.value}
							/>
						</div>
						<div>
							<p className="mb-1 text-xs font-medium text-muted-foreground">M2M Read-Only (4 items)</p>
							<RelationFieldControl
								cardinality="m2m"
								name="sc_rel_ro_m2m"
								readOnly={true}
								relationToken=""
								selectedItems={r.m2mSelectedFour}
								value={r.m2mSelectedFour.map((item) => item.value)}
							/>
						</div>
						<div>
							<p className="mb-1 text-xs font-medium text-muted-foreground">M2A Read-Only (Mixed) & Empty</p>
							<div className="flex flex-wrap items-center gap-2">
								<RelationFieldControl
									cardinality="m2a"
									name="sc_rel_ro_m2a"
									readOnly={true}
									relationToken=""
									selectedItems={r.m2aSelectedThree}
									value={r.m2aSelectedThree.map((item) => item.key)}
								/>
								<RelationFieldControl
									cardinality="m2o"
									name="sc_rel_ro_empty"
									readOnly={true}
									relationToken=""
									value=""
								/>
							</div>
						</div>
					</div>
				</CaseCard>
			</div>
		</section>
	);
}

export function FormContextsShowcaseSection({ fixtures }: { fixtures: ShowcaseFixtures }) {
	return (
		<section data-rw-showcase-section="contexts" aria-labelledby="rw-sec-contexts" className="space-y-4">
			<SectionHeading
				id="rw-sec-contexts"
				icon="layers"
				title="Form Contexts, Grids, Tabs, Inline Settings & Narrow Inspector"
				subtitle="SchemaForm layout containers combining Media, Link, Relation, multi-language tabs, validation errors, and constrained 400px inspector width."
			/>

			<CaseCard caseId="ctx-grid" title="12-Column Responsive Grid (12 · 6+6 · 4+4+4 · 8+4)" badge="colSpan matrix">
				<SchemaForm schema={fixtures.contexts.gridSchema} />
			</CaseCard>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="ctx-tabs" title="Nested Tabs + Collapsible Fieldset" badge="SchemaTabs + Section">
					<SchemaForm schema={fixtures.contexts.tabsSchema} />
				</CaseCard>

				<CaseCard caseId="ctx-inline-settings" title="InlineFieldSettingsPopover & Option Chips" badge="inlineSettings">
					<SchemaForm schema={fixtures.contexts.inlineSettingsSchema} />
				</CaseCard>

				<CaseCard caseId="ctx-multilang" title="Multi-Language Field Tabs (EN / TR + Expand Toggle)" badge="pw-lang">
					<SchemaForm schema={fixtures.contexts.multiLangSchema} />
				</CaseCard>

				<CaseCard caseId="ctx-states" title="Field Anatomy: Error, Disabled & Read-Only" badge="validation + locks">
					<SchemaForm schema={fixtures.contexts.statesSchema} />
				</CaseCard>
			</div>

			<CaseCard
				caseId="ctx-narrow-inspector"
				title="Constrained 400px Inspector Panel Context"
				badge="max-w-[400px]"
				description="Tests how Title (i18n), LinkField Media, ImageField, and Relation controls stack inside a narrow sidebar inspector even on desktop."
			>
				<div className="mx-auto w-full max-w-[400px] rounded-xl border border-dashed border-primary/40 bg-muted/20 p-3.5">
					<SchemaForm schema={fixtures.contexts.narrowPanelSchema} />
				</div>
			</CaseCard>
		</section>
	);
}

export function OtherControlsShowcaseSection({ fixtures }: { fixtures: ShowcaseFixtures }) {
	return (
		<section data-rw-showcase-section="controls" aria-labelledby="rw-sec-controls" className="space-y-4">
			<SectionHeading
				id="rw-sec-controls"
				icon="sliders"
				title="All Form Inputfield Controls"
				subtitle="Text affixes, Secret, Number, Color, Tags, Combobox, Unit/Currency, Segmented, Spacing, Dual Range, OTP, Password, Markdown, Datetime, Choices, Tiptap, Icon, Rating, KeyValue, Repeater & Signature."
			/>

			<CaseCard caseId="ctrl-text-datetime" title="Text, Secret, Number, Color, Datetime & Code Textarea" badge="inputs">
				<SchemaForm schema={fixtures.controls.textSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-color-variants" title="ColorField · Empty/Inherit, Hex, Alpha RGBA, Read-Only & Error" badge="color · picker">
				<SchemaForm schema={fixtures.controls.colorSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-tags-combobox" title="TagsField & ComboboxField · Chips, Predefined, Searchable Single & Multi" badge="tags + combobox">
				<SchemaForm schema={fixtures.controls.tagsAndComboboxSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-unit-currency" title="UnitNumberField & CurrencyField · Steppers, CSS Units, Currencies & Bounds" badge="unit_number + currency">
				<SchemaForm schema={fixtures.controls.unitAndCurrencySchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-segmented" title="SegmentedField · Labeled, Icon-Only, Full-Width & Multi-Toggle" badge="segmented">
				<SchemaForm schema={fixtures.controls.segmentedSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-spacing-range" title="SpacingField & Dual-Thumb RangeField · 4-Side Lock, Units & Min–Max Sliders" badge="spacing + range_slider">
				<SchemaForm schema={fixtures.controls.spacingAndRangeSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-otp-password" title="OtpField & PasswordField · Code Slots, Strength Meter, Policy & Generator" badge="otp + password">
				<SchemaForm schema={fixtures.controls.otpAndPasswordSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-markdown" title="MarkdownField · Write/Preview/Split Tabs, Formatting & Safe Links" badge="markdown">
				<SchemaForm schema={fixtures.controls.markdownSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-choices-sliders" title="Selects, Switches, Option Grids, AsmSelect & Range Sliders" badge="choices">
				<SchemaForm schema={fixtures.controls.choiceSchema} />
			</CaseCard>

			<CaseCard caseId="ctrl-rich-structured" title="Tiptap, Custom Icon Picker, Rating, KeyValue, Repeater & Signature" badge="structured">
				<SchemaForm schema={fixtures.controls.richAndStructuredSchema} />
			</CaseCard>
		</section>
	);
}

export function DateTimeShowcaseSection({ fixtures }: { fixtures: ShowcaseFixtures }) {
	const CalendarEngine = runtime.Calendar;
	const [sdkDate, setSdkDate] = useState<string>('2026-11-21');
	const [sdkTime, setSdkTime] = useState<string>('14:30');
	const [sdkDateTime, setSdkDateTime] = useState<string>('2026-11-21 14:30');
	const [sdkRange, setSdkRange] = useState<{ from: string; to: string }>({
		from: '2026-11-15',
		to: '2026-11-22',
	});
	const [inlineDay, setInlineDay] = useState<Date | undefined>(() => new Date(2026, 10, 21));

	return (
		<section data-rw-showcase-section="datetime" aria-labelledby="rw-sec-datetime" className="space-y-4">
			<SectionHeading
				id="rw-sec-datetime"
				icon="calendar"
				title="Date, Time, DateTime & Date Range Pickers"
				subtitle="SchemaForm controls and Calendar engine primitives across empty, populated, bounded, 12h/24h, presets, read-only, and error states."
			/>

			<CaseCard caseId="dt-date-variants" title="DateField · Empty, Populated & Bounded" badge="date · picker">
				<SchemaForm schema={fixtures.datetime.dateSchema} />
			</CaseCard>

			<CaseCard caseId="dt-time-variants" title="TimeField · 24h, 12h AM/PM & Seconds" badge="time · picker">
				<SchemaForm schema={fixtures.datetime.timeSchema} />
			</CaseCard>

			<CaseCard caseId="dt-datetime-combo" title="DateTimeField · Calendar + Time & Timezone" badge="datetime · picker">
				<SchemaForm schema={fixtures.datetime.datetimeSchema} />
			</CaseCard>

			<CaseCard caseId="dt-daterange-variants" title="DateRangeField · Empty, Presets & Constrained" badge="daterange">
				<SchemaForm schema={fixtures.datetime.daterangeSchema} />
			</CaseCard>

			<CaseCard
				caseId="dt-sdk-calendar"
				title="Calendar Engine Primitives · Standalone Pickers & Inline Calendar"
				badge="Calendar SDK"
			>
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div className="space-y-3 min-w-0">
						<div className="space-y-1">
							<span className="text-[11px] font-medium text-muted-foreground">DatePicker</span>
							<CalendarEngine.DatePicker
								value={sdkDate}
								onChange={(iso) => setSdkDate(iso)}
								className="w-full"
								triggerClassName="w-full"
							/>
						</div>
						<div className="space-y-1">
							<span className="text-[11px] font-medium text-muted-foreground">TimePicker (12h)</span>
							<CalendarEngine.TimePicker
								value={sdkTime}
								hourFormat="12h"
								minuteStep={15}
								onChange={(iso) => setSdkTime(iso)}
								className="w-full"
								triggerClassName="w-full"
							/>
						</div>
						<div className="space-y-1">
							<span className="text-[11px] font-medium text-muted-foreground">DateTimePicker</span>
							<CalendarEngine.DateTimePicker
								value={sdkDateTime}
								timezone="Europe/Istanbul"
								onChange={(iso) => setSdkDateTime(iso)}
								className="w-full"
								triggerClassName="w-full"
							/>
						</div>
						<div className="space-y-1">
							<span className="text-[11px] font-medium text-muted-foreground">DateRangePicker</span>
							<CalendarEngine.DateRangePicker
								value={sdkRange}
								onChange={(iso) => setSdkRange(iso)}
								className="w-full"
								triggerClassName="w-full"
							/>
						</div>
					</div>
					<div className="min-w-0 overflow-x-auto flex justify-start sm:justify-center">
						<div className="rounded-lg border border-border bg-card inline-block max-w-full">
							<CalendarEngine.Calendar
								mode="single"
								selected={inlineDay}
								defaultMonth={inlineDay}
								onSelect={(d) => setInlineDay(d)}
							/>
						</div>
					</div>
				</div>
			</CaseCard>

			<CaseCard caseId="dt-readonly-error" title="Date & Time Read-Only & Error States" badge="readOnly + error">
				<SchemaForm schema={fixtures.datetime.statesSchema} />
			</CaseCard>
		</section>
	);
}

export function PrimitivesShowcaseSection({ fixtures }: { fixtures: ShowcaseFixtures }) {
	const [tabVal, setTabVal] = useState('overview');
	const [dialogOpen, setDialogOpen] = useState(false);

	return (
		<section data-rw-showcase-section="primitives" aria-labelledby="rw-sec-primitives" className="space-y-4">
			<SectionHeading
				id="rw-sec-primitives"
				icon="layout-grid"
				title="UI Primitives, Patterns & Viewports"
				subtitle="Buttons, Badges, Alerts, StatCards, DataViewport (Table & Cards), Tabs, Progress, Skeleton, CliBox, CodePreview, EmptyState, Dialog, Popover, and Menu."
			/>

			<CaseCard caseId="prim-stats" title="StatCard 4-Column Dashboard Strip" badge="StatCard">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<StatCard label="Media Scenarios" value="11" caption="0 / 1 / 4 items" icon="image" tone="primary" />
					<StatCard label="Link Scenarios" value="19" caption="All 9 types" icon="link-2" tone="success" />
					<StatCard label="Relation Widgets" value="12" caption="M2O · M2M · O2M · M2A" icon="git-branch" tone="warning" />
					<StatCard label="Active Breakpoints" value="5" caption="375 · 420 · 768 · 1280" icon="monitor" tone="default" />
				</div>
			</CaseCard>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="prim-buttons-badges" title="Buttons & Badges" badge="Button + Badge">
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="primary" size="sm" icon="check">Primary</Button>
							<Button variant="secondary" size="sm" icon="layers">Secondary</Button>
							<Button variant="outline" size="sm" icon="sliders">Outline</Button>
							<Button variant="ghost" size="sm" icon="eye">Ghost</Button>
							<Button variant="destructive" size="sm" icon="trash-2">Destructive</Button>
							<Button variant="primary" size="sm" disabled>Disabled</Button>
						</div>
						<div className="flex flex-wrap items-center gap-1.5">
							<Badge variant="default">Default</Badge>
							<Badge variant="primary">Primary</Badge>
							<Badge variant="secondary">Secondary</Badge>
							<Badge variant="outline">Outline</Badge>
							<Badge variant="success">Success</Badge>
							<Badge variant="warning">Warning</Badge>
							<Badge variant="danger">Danger</Badge>
						</div>
						<div className="flex flex-wrap items-center gap-2 pt-1">
							<CopyValueButton value="vendor/bin/wire version --json" subjectLabel="CLI command" revealOnHover={false} />
							<Button type="button" variant="outline" size="xs" icon="square" onClick={() => setDialogOpen(true)}>
								Open Dialog
							</Button>
							<Popover>
								<PopoverTrigger render={<Button type="button" variant="outline" size="xs" icon="info">Open Popover</Button>} />
								<PopoverContent className="w-72 space-y-1.5">
									<PopoverTitle>Floating Popover Check</PopoverTitle>
									<PopoverDescription>Verifies surface border, z-index, and dark-mode contrast inside containers.</PopoverDescription>
								</PopoverContent>
							</Popover>
							<Menu>
								<MenuTrigger render={<Button type="button" variant="outline" size="xs" icon="more-vertical">Menu</Button>} />
								<MenuContent align="start">
									<MenuGroup>
										<MenuGroupLabel>Showcase Actions</MenuGroupLabel>
										<MenuItem onClick={() => setTabVal('overview')}>Overview Tab</MenuItem>
										<MenuItem onClick={() => setTabVal('tokens')}>Tokens Tab</MenuItem>
									</MenuGroup>
									<MenuSeparator />
									<MenuItem onClick={() => setDialogOpen(true)}>Inspect Dialog</MenuItem>
								</MenuContent>
							</Menu>
						</div>
					</div>
				</CaseCard>

				<CaseCard caseId="prim-alerts-feedback" title="Alerts, Progress & Skeletons" badge="feedback">
					<div className="space-y-2.5">
						<Alert>
							<AlertTitle>Neutral Status Notice</AlertTitle>
							<AlertDescription>Baseline surface styling inside cards and panel containers.</AlertDescription>
						</Alert>
						<Alert variant="warning">
							<AlertTitle>Viewport Constraint Warning</AlertTitle>
							<AlertDescription>Verify button wrapping and badge truncation at 375px width.</AlertDescription>
						</Alert>
						<Alert variant="destructive">
							<AlertTitle>Validation Failure Example</AlertTitle>
							<AlertDescription>High-contrast alert foreground on light and dark backgrounds.</AlertDescription>
						</Alert>
						<Progress value={68} />
						<div className="grid grid-cols-3 gap-2">
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
						</div>
					</div>
				</CaseCard>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<CaseCard caseId="prim-tabs-code-cli" title="Tabs, CliBox & CodePreview" badge="Tabs + CliBox">
					<Tabs value={tabVal} onValueChange={setTabVal}>
						<TabsList>
							<TabsTrigger value="overview">CLI & Code</TabsTrigger>
							<TabsTrigger value="tokens">Empty & Table</TabsTrigger>
						</TabsList>
						<TabsContent value="overview" className="space-y-3 pt-2">
							<CliBox
								label="Sequential Check Command"
								command="php vendor/bin/wire test:e2e --module=React --json"
								wrap={true}
							/>
							<CodePreview
								title="Container Query Example"
								badge="css"
								code={`@container/rw-media (width >= 20rem) {\n  .rw-card { flex-direction: row; }\n}`}
							/>
						</TabsContent>
						<TabsContent value="tokens" className="pt-2">
							<EmptyState
								icon="inbox"
								title="No Matching Items"
								description="Empty state layout centered cleanly inside narrow and wide cards."
								action={<Button size="xs" variant="outline">Clear Filter</Button>}
							/>
						</TabsContent>
					</Tabs>
				</CaseCard>

				<CaseCard caseId="prim-table-simple" title="Basic Table Primitive" badge="Table">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Viewport</TableHead>
								<TableHead>Width</TableHead>
								<TableHead>Target</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow>
								<TableCell className="font-medium">Mobile</TableCell>
								<TableCell className="font-mono text-xs">375px</TableCell>
								<TableCell><Badge variant="outline">Stack</Badge></TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Inspector</TableCell>
								<TableCell className="font-mono text-xs">420px</TableCell>
								<TableCell><Badge variant="secondary">Dense</Badge></TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Tablet</TableCell>
								<TableCell className="font-mono text-xs">768px</TableCell>
								<TableCell><Badge variant="success">2-Col</Badge></TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</CaseCard>
			</div>

			<CaseCard caseId="prim-viewport-table" title="DataViewport · Table Mode" badge="MarkupReactTable">
				<DataViewport state={fixtures.primitives.viewportTableState} />
			</CaseCard>

			<CaseCard caseId="prim-viewport-cards" title="DataViewport · Cards Mode" badge="MarkupReactCards">
				<DataViewport state={fixtures.primitives.viewportCardsState} />
			</CaseCard>

			<Dialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				title="Modal Dialog Surface Check"
				description="Verifies portal centering, backdrop blur, focus ring, and responsive width on narrow viewports."
				footer={
					<div className="flex justify-end gap-2">
						<Button size="sm" variant="outline" onClick={() => setDialogOpen(false)}>Close</Button>
						<Button size="sm" variant="primary" onClick={() => setDialogOpen(false)}>Confirm</Button>
					</div>
				}
			>
				<p className="text-xs text-muted-foreground leading-relaxed">
					Dialog rendered cleanly inside the active theme and viewport context.
				</p>
			</Dialog>
		</section>
	);
}
