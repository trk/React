<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\Inertia\Contracts\InertiaSerializable;
use Totoglu\Inertia\InteractWithInertia;
use Totoglu\React\Inertia\InteractWithReactTranslations;
use Totoglu\React\Tiptap\MiniBlockRegistry;
use Totoglu\React\Tiptap\MiniBlockRenderer;
use Totoglu\React\Tiptap\TiptapAssetResolver;
use Totoglu\React\Tiptap\TiptapConfigFormBuilder;
use Totoglu\React\Tiptap\TiptapContentPolicy;
use Totoglu\React\Tiptap\TiptapPresetCatalog;
use Totoglu\React\Support\IslandMarkup;

/**
 * InputfieldTiptap
 *
 * Configurable Tiptap v3 Rich Text Editor Inputfield (`extends InputfieldTextarea`)
 * powered by `React` (`React 19` + `ProseMirror` + `Tailwind CSS v4`).
 *
 * Compatible with ProcessWire `FieldtypeTextarea` and `FieldtypeTextareaLanguage` fields
 * (selectable under `Details > Inputfield Type > Tiptap`), standalone `InputfieldForm` /
 * `ProcessPageEdit` forms, and `React` `SchemaForm` / declarative blueprints.
 *
 * Editor & Field Settings
 * -----------------------
 * @property string $preset Editor profile (`core`, `editor`, `canvas`, `blocks`)
 * @property string $toolbar Space-separated toolbar items (`|` separates groups)
 * @property string $bubbleToolbar Space-separated floating selection toolbar items
 * @property array<int, string> $headlines Allowed heading tags (`h1`..`h6`)
 * @property array<int, string> $features Enabled editor features (`toolbar`, `stickybars`, `bubbleMenu`, `statusbar`, `spellcheck`, `purifier`, `pasteFilter`, `sourceCode`, `imgUpload`, `imgResize`, `slashMenu`, `blockHandles`)
 * @property array<int, int> $toggles Markup cleanup toggles (`toggleCleanDiv`, `toggleCleanP`, `toggleCleanNbsp`, `toggleRemoveStyles`)
 * @property int $height Minimum editor height in pixels (`0` = auto height from `rows`)
 * @property int $maxHeight Maximum scrollable editor height in pixels (`0` = unlimited)
 * @property int $inlineMode Editor frame mode (`0` = Framed editor, `1` = Chromeless inline editor)
 * @property string $settingsField Optional name of another `InputfieldTiptap` field to inherit settings from
 * @property string $settingsJSON Optional per-field JSON settings override (`replace_*` / `add_*` / `append_*`)
 * @property int|bool $slashMenu Opt-in `/` slash command palette (`0` = inherit/auto, `1` = enabled)
 * @property array<int, string> $miniBlocks Enabled flat editorial mini-block identifiers for this field
 * @property array<int, string> $imageFields Allowed target image field names for editor uploads (`['x']` = disabled, `[]` = auto-detect)
 * @property bool $readOnly Whether the editor is rendered in read-only mode
 *
 * Module Settings
 * ---------------
 * @property string $defaultsJSON Module-wide JSON settings override applied before field overrides
 * @property string $extraCSS Optional CSS rules scoped to `.rw-tiptap-prose` across all editors
 *
 * @method array<string, mixed> registerMiniBlocks(array<string, mixed> $blocks)
 * @method bool isLanguageEditable(Language $lang)
 */
class InputfieldTiptap extends InputfieldTextarea implements ConfigurableModule, InertiaSerializable
{
	use InteractWithInertia;
	use InteractWithReactTranslations;

	public const string tiptapVersion = '3.34.0';

	public const bool INERTIA_IS_MARKUP_FIELD = true;

	public const int toggleCleanDiv = TiptapContentPolicy::TOGGLE_CLEAN_DIV;
	public const int toggleCleanP = TiptapContentPolicy::TOGGLE_CLEAN_P;
	public const int toggleCleanNbsp = TiptapContentPolicy::TOGGLE_CLEAN_NBSP;
	public const int toggleRemoveStyles = TiptapContentPolicy::TOGGLE_REMOVE_STYLES;

	public const string defaultToolbar = TiptapContentPolicy::DEFAULT_TOOLBAR;

	public const string defaultBubbleToolbar = TiptapContentPolicy::DEFAULT_BUBBLE_TOOLBAR;

	/**
	 * Canonical toolbar item identifiers supported by `InputfieldTiptap`.
	 *
	 * @var list<string>
	 */
	public const array ALL_TOOLBAR_TOKENS = TiptapContentPolicy::ALL_TOOLBAR_TOKENS;

	/**
	 * Default enabled editor features (keeps `slashMenu` opt-in per field).
	 *
	 * @var list<string>
	 */
	public const array DEFAULT_FEATURES = TiptapContentPolicy::DEFAULT_FEATURES;

	/**
	 * Canonical feature flags queried via `useFeature($name)`.
	 *
	 * @var list<string>
	 */
	public const array ALL_FEATURES = TiptapContentPolicy::ALL_FEATURES;

	/**
	 * Canonical heading levels allowed in `headlines`.
	 *
	 * @var list<string>
	 */
	public const array ALL_HEADLINES = TiptapContentPolicy::ALL_HEADLINES;

	/**
	 * Canonical editor preset profiles.
	 *
	 * @var list<string>
	 */
	public const array ALL_PRESETS = TiptapPresetCatalog::ALL_PRESETS;

	/**
	 * Track explicit per-instance property assignments (set after `init()`) so module defaults
	 * and `defaultsJSON` apply cleanly unless overridden on the field/inputfield instance.
	 *
	 * @var array<string, bool>
	 */
	private array $explicitFieldOverrides = [];

	private bool $isInitialized = false;

	/**
	 * Per-instance sanitized input cache preventing double HTMLPurifier passes when `LanguageSupport`
	 * re-invokes `___processInput()` for secondary language inputs (`field__{langId}`).
	 *
	 * @var array<string, string>
	 */
	private array $processedInputCache = [];

	/**
	 * Per-instance memoized mini-block catalog invalidated on settings/hook/directory/locale changes.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $availableMiniBlocksCache = null;

	private ?string $availableMiniBlocksCacheKey = null;

	/**
	 * Guard against circular `settingsField` inheritance chains.
	 *
	 * @var array<string, bool>
	 */
	private static array $resolvingFields = [];

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('Tiptap', __FILE__),
			'version' => 10,
			'summary' => __('Rich text editor with customizable toolbars, content blocks, HTML cleanup, and multi-language support.', __FILE__),
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'align-left',
			'requires' => [
				'PHP>=8.4',
				'ProcessWire>=3.0.271',
				'Inertia',
				'React',
			],
		];
	}

	/**
	 * Default module and field configuration values.
	 *
	 * @return array<string, mixed>
	 */
	public static function getDefaultConfig(): array
	{
		return [
			'preset' => TiptapPresetCatalog::PRESET_EDITOR,
			'toolbar' => self::defaultToolbar,
			'bubbleToolbar' => self::defaultBubbleToolbar,
			'headlines' => ['h2', 'h3', 'h4'],
			'features' => self::DEFAULT_FEATURES,
			'toggles' => [self::toggleCleanP, self::toggleRemoveStyles],
			'height' => 260,
			'maxHeight' => 640,
			'inlineMode' => 0,
			'slashMenu' => 0,
			'miniBlocks' => [],
			'imageFields' => [],
			'defaultsJSON' => '',
			'extraCSS' => '',
			'settingsField' => '',
			'settingsJSON' => '',
		];
	}

	public function __construct()
	{
		parent::__construct();
		foreach (self::getDefaultConfig() as $key => $value) {
			parent::set($key, $value);
		}
		parent::set('readOnly', false);
	}

	public function init(): void
	{
		parent::init();
		$moduleConfig = $this->wire()->modules->getConfig($this->className());
		if (is_array($moduleConfig)) {
			foreach ($moduleConfig as $key => $value) {
				if (!isset($this->explicitFieldOverrides[$key])) {
					parent::set($key, $value);
				}
			}
		}
		$this->explicitFieldOverrides = [];
		$this->availableMiniBlocksCache = null;
		$this->availableMiniBlocksCacheKey = null;
		$this->isInitialized = true;
	}

	public function __clone()
	{
		parent::__clone();
		$this->availableMiniBlocksCache = null;
		$this->availableMiniBlocksCacheKey = null;
		$this->processedInputCache = [];
	}

	/**
	 * @param string $key
	 * @param mixed $value
	 */
	public function set($key, $value): self
	{
		if ($this->isInitialized && is_string($key) && array_key_exists($key, self::getDefaultConfig())) {
			$this->explicitFieldOverrides[$key] = true;
			$this->availableMiniBlocksCache = null;
			$this->availableMiniBlocksCacheKey = null;
		}

		parent::set($key, $value);

		return $this;
	}

	/**
	 * Disable `InputfieldTextarea`'s standalone 32 KB plain-text default maxlength so rich HTML
	 * is never truncated unless an explicit `maxlength` limit is configured.
	 */
	public function getDefaultMaxlength(): int
	{
		return 0;
	}

	/**
	 * Preserve well-formed rich HTML without running `Sanitizer::textarea()` byte truncation mid-tag.
	 *
	 * @param string $value
	 */
	protected function setAttributeValue($value): string
	{
		$str = (string) $value;
		if (str_contains($str, "\r\n")) {
			$str = str_replace("\r\n", "\n", $str);
		}

		return $this->noTrim ? $str : trim($str);
	}

	/**
	 * Evaluate semantic rich-text emptiness (treating `<p><br></p>`, `<p>&nbsp;</p>`, and empty
	 * callout wrappers as empty while preserving standalone media/void elements).
	 */
	public function isEmpty(): bool
	{
		if ($this->getSetting('useLanguages')) {
			$languages = $this->wire()->languages;
			if (is_iterable($languages)) {
				foreach ($languages as $lang) {
					if (!$lang instanceof Language) {
						continue;
					}
					$valKey = $lang->isDefault() ? 'value' : 'value' . (int) $lang->id;
					$val = (string) ($lang->isDefault() ? $this->attr('value') : $this->get($valKey));
					if (!TiptapContentPolicy::isEmptyHtml($val)) {
						return false;
					}
				}

				return true;
			}
		}

		$rawVal = $this->attr('value');

		return TiptapContentPolicy::isEmptyHtml(is_scalar($rawVal) ? (string) $rawVal : '');
	}

	/**
	 * Check whether the current user has edit permission for `$lang` (`page-edit-lang-*`).
	 *
	 * On ProcessWire Page fields (`hasPage`), delegates directly to `Languages::editable()`.
	 * In standalone or entity/block forms without a host `Page`, honors installed
	 * `page-edit-lang-*` permissions for logged-in non-superusers without requiring `page-edit`.
	 */
	public function ___isLanguageEditable(Language $lang): bool
	{
		$user = $this->wire()->user;
		if ($user->isSuperuser()) {
			return true;
		}

		$languages = $this->wire()->languages;
		if (!$languages instanceof Languages) {
			return true;
		}

		$hasPage = $this->getSetting('hasPage');
		if (($hasPage instanceof Page && $hasPage->id > 0) || ($user instanceof User && $user->hasPermission('page-edit'))) {
			return (bool) $languages->editable($lang);
		}

		if ($user instanceof User && $user->isLoggedin()) {
			$permissionName = (string) $languages->getPageEditPermission($lang);
			return $permissionName === '' ? true : (bool) $user->hasPermission($permissionName);
		}

		return true;
	}

	/**
	 * Resolve configured plain-text character limit across ProcessWire Page fields (`data-maxlength`)
	 * and standalone/declarative forms (`maxlength` / `maxLength`).
	 */
	public function resolveMaxLength(): int
	{
		$rawDirect = $this->attr('maxlength');
		$direct = is_numeric($rawDirect) ? (int) $rawDirect : 0;
		if ($direct > 0) {
			return $direct;
		}
		$attrs = $this->getAttributes();

		return max(0, (int) ($attrs['data-maxlength'] ?? $attrs['maxlength'] ?? $this->getSetting('maxlength') ?? $this->getSetting('maxLength') ?? 0));
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldTiptap';
	}

	public function react(): React
	{
		return React::instance($this);
	}

	/**
	 * Collect raw HTML values across default and secondary language slots for asset/block preservation.
	 *
	 * @return list<string>
	 */
	public function collectCurrentHtmlValues(): array
	{
		$attrs = $this->getAttributes();
		$values = [];
		$defaultVal = $attrs['value'] ?? $this->val() ?? '';
		if (is_scalar($defaultVal) && (string) $defaultVal !== '') {
			$values[] = (string) $defaultVal;
		}

		if ($this->getSetting('useLanguages')) {
			$languages = $this->wire()->languages;
			if (is_iterable($languages)) {
				foreach ($languages as $lang) {
					if (!$lang instanceof Language || $lang->isDefault()) {
						continue;
					}
					$valKey = 'value' . (int) $lang->id;
					$rawVal = $attrs[$valKey] ?? $this->get($valKey) ?? '';
					if (is_scalar($rawVal) && (string) $rawVal !== '') {
						$values[] = (string) $rawVal;
					}
				}
			}
		}

		return $values;
	}

	/**
	 * Resolve ordered capability bundles required for this field (`core` plus optional `editor`, `canvas`, `blocks`).
	 *
	 * @return list<string>
	 */
	public function resolveActiveBundles(): array
	{
		$resolved = $this->resolveEditorSettings($this->collectCurrentHtmlValues());

		return $resolved['bundles'];
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		$workspace = $this->react();
		$assets = [];
		foreach (TiptapAssetResolver::resolveScriptFilenames($this->resolveActiveBundles()) as $scriptFile) {
			$assets = array_merge($assets, $workspace->resolveModuleAssetUrl($scriptFile));
		}

		return array_values(array_unique($assets));
	}

	/**
	 * @return list<string>
	 */
	public function getModuleStyleAssets(): array
	{
		$workspace = $this->react();
		$assets = [];
		foreach (TiptapAssetResolver::resolveStyleFilenames() as $styleFile) {
			$assets = array_merge($assets, $workspace->resolveModuleAssetUrl($styleFile));
		}

		return array_values(array_unique($assets));
	}

	/**
	 * Static UI translation catalog for `InputfieldTiptap`, parsed natively by ProcessWire's `LanguageParser`.
	 *
	 * @return array<string, mixed>
	 */
	public function ___translations(): array
	{
		return [
			'editor' => [
				'placeholder' => $this->_('Write something...'),
				'placeholderSlash' => $this->_("Write something, or type '/' for blocks..."),
				'formattingToolbar' => $this->_('Rich text formatting'),
				'selectionToolbar' => $this->_('Selection formatting'),
				'languageTabs' => $this->_('Language tabs'),
				'copyLanguage' => $this->_('Copy {language}'),
				'copiedFromLanguage' => $this->_('Copied content from {language}'),
				'closeDialog' => $this->_('Close dialog'),
			],
			'groups' => [
				'textStyle' => $this->_('Text style'),
				'inlineFormatting' => $this->_('Inline formatting'),
				'textAlignment' => $this->_('Text alignment'),
				'listsAndBlocks' => $this->_('Lists and blocks'),
				'insertElements' => $this->_('Insert elements'),
				'history' => $this->_('History'),
				'utilities' => $this->_('Editor utilities'),
				'formattingGroup' => $this->_('Formatting group {index}'),
			],
			'styles' => [
				'ariaLabel' => $this->_('Paragraph style'),
				'paragraph' => $this->_('Paragraph'),
				'heading' => $this->_('Heading {level}'),
			],
			'tools' => [
				'bold' => $this->_('Bold'),
				'italic' => $this->_('Italic'),
				'underline' => $this->_('Underline'),
				'strike' => $this->_('Strikethrough'),
				'code' => $this->_('Inline code'),
				'highlight' => $this->_('Highlight'),
				'subscript' => $this->_('Subscript'),
				'superscript' => $this->_('Superscript'),
				'alignleft' => $this->_('Align left'),
				'aligncenter' => $this->_('Align center'),
				'alignright' => $this->_('Align right'),
				'alignjustify' => $this->_('Justify'),
				'bullist' => $this->_('Bullet list'),
				'numlist' => $this->_('Numbered list'),
				'tasklist' => $this->_('Task list'),
				'blockquote' => $this->_('Blockquote'),
				'codeblock' => $this->_('Code block'),
				'link' => $this->_('Link'),
				'unlink' => $this->_('Remove link'),
				'anchor' => $this->_('Insert anchor'),
				'image' => $this->_('Insert image'),
				'table' => $this->_('Insert table'),
				'tableActive' => $this->_('Table active'),
				'tableInsert3x3' => $this->_('Insert 3x3 table'),
				'hr' => $this->_('Insert horizontal rule'),
				'insertblock' => $this->_('Insert block'),
				'blockShort' => $this->_('Block'),
				'removeformat' => $this->_('Clear formatting'),
				'source' => $this->_('HTML source code'),
				'fullscreen' => $this->_('Fullscreen editor'),
				'exitFullscreen' => $this->_('Exit fullscreen'),
				'exitFullscreenButton' => $this->_('Exit Fullscreen'),
				'undo' => $this->_('Undo'),
				'redo' => $this->_('Redo'),
			],
			'link' => [
				'urlPlaceholder' => $this->_('https://example.com or /page/'),
				'openInNewTab' => $this->_('New tab'),
				'unlink' => $this->_('Unlink'),
				'cancel' => $this->_('Cancel'),
				'invalidUrl' => $this->_('Enter a valid https://, http://, mailto:, tel:, or relative URL.'),
				'dialogTitle' => $this->_('Insert Link'),
				'editDialogTitle' => $this->_('Edit Link'),
				'linkTextLabel' => $this->_('Link text'),
				'linkTextPlaceholder' => $this->_('Visible text for this link'),
				'tabLink' => $this->_('Link'),
				'linkToUrlLabel' => $this->_('Link to URL'),
				'linkToUrlHint' => $this->_('Enter a URL, email address, anchor, or word(s) to find a page.'),
				'emptyUrl' => $this->_('Enter a URL, or pick a page, file, or anchor below.'),
				'clearUrl' => $this->_('Clear URL'),
				'searchResultsLabel' => $this->_('Matching pages'),
				'selectChildPage' => $this->_('Select Child Page'),
				'noChildPages' => $this->_('This page has no child pages yet.'),
				'unpublishedBadge' => $this->_('Unpublished'),
				'hiddenBadge' => $this->_('Hidden'),
				'fileSourceLabel' => $this->_('File source'),
				'tabPages' => $this->_('Select Page'),
				'tabFiles' => $this->_('Select File'),
				'tabAnchors' => $this->_('Select Anchor'),
				'searchPagesPlaceholder' => $this->_('Type page title, URL, email, or #anchor...'),
				'noMatchingPages' => $this->_('No matching pages found.'),
				'loadingTree' => $this->_('Loading page tree...'),
				'expandChildren' => $this->_('Expand child pages'),
				'collapseChildren' => $this->_('Collapse child pages'),
				'filesOnPage' => $this->_('Files on {page}'),
				'hostEntityFiles' => $this->_('Current item files'),
				'loadingFiles' => $this->_('Loading files...'),
				'noFilesOnPage' => $this->_('No files are attached to this item.'),
				'anchorIdLabel' => $this->_('Anchor ID'),
				'anchorIdPlaceholder' => $this->_('section-heading'),
				'anchorInvalidId' => $this->_('Anchor ID must start with a letter and contain only letters, numbers, hyphens, or underscores.'),
				'insertAnchorTitle' => $this->_('Insert Named Anchor'),
				'insertAnchorBtn' => $this->_('Insert Anchor'),
				'removeAnchorBtn' => $this->_('Remove Anchor'),
				'attributesHeading' => $this->_('Attributes'),
				'titleAttrLabel' => $this->_('Title attribute'),
				'titleAttrHint' => $this->_('Additional text to describe the link.'),
				'targetAttrLabel' => $this->_('Target window'),
				'targetAttrHint' => $this->_('Where this link will open.'),
				'targetDefault' => $this->_('Same window (default)'),
				'relAttrLabel' => $this->_('Rel attributes'),
				'relAttrHint' => $this->_('Relationship of the link to this document.'),
				'classAttrLabel' => $this->_('CSS classes'),
				'insertLinkBtn' => $this->_('Insert Link'),
				'updateLinkBtn' => $this->_('Update Link'),
			],
			'image' => [
				'urlLabel' => $this->_('Image URL'),
				'urlPlaceholder' => $this->_('/site/assets/files/... or https://...'),
				'altLabel' => $this->_('Image alt text'),
				'altPlaceholder' => $this->_('Alt description'),
				'insert' => $this->_('Insert'),
				'cancel' => $this->_('Cancel'),
				'invalidUrl' => $this->_('Enter a valid https://, http://, or site-relative image URL.'),
				'dialogSelectTitle' => $this->_('Select Image'),
				'dialogEditTitle' => $this->_('Edit Image'),
				'tabLibrary' => $this->_('Page Images'),
				'tabExternalUrl' => $this->_('External URL'),
				'sourcePageLabel' => $this->_('Image source'),
				'currentItemSource' => $this->_('Current item'),
				'changeSourcePage' => $this->_('Choose another page'),
				'hideSourcePicker' => $this->_('Hide page browser'),
				'uploadImageBtn' => $this->_('Upload Image'),
				'uploadingImages' => $this->_('Uploading image...'),
				'uploadTargetField' => $this->_('Upload to field'),
				'loadingImages' => $this->_('Loading images...'),
				'noImageFieldsOnPage' => $this->_('There are no image fields on this page. Choose another page below to select or upload images.'),
				'noImagesUploadUnavailable' => $this->_('No images found on this page. Choose another page to select images from.'),
				'noImagesAvailable' => $this->_('No images found on this source. Upload an image or choose another page.'),
				'backToLibrary' => $this->_('Back to Images'),
				'dimensionsHeading' => $this->_('Dimensions & Quality'),
				'widthLabel' => $this->_('Width (px)'),
				'heightLabel' => $this->_('Height (px)'),
				'lockAspect' => $this->_('Keep aspect ratio'),
				'resetOriginalSize' => $this->_('Original size ({width}x{height})'),
				'hidpiLabel' => $this->_('HiDPI / Retina'),
				'alignmentLabel' => $this->_('Alignment'),
				'alignNone' => $this->_('No alignment'),
				'alignLeft' => $this->_('Align left'),
				'alignCenter' => $this->_('Align center'),
				'alignRight' => $this->_('Align right'),
				'captionToggleLabel' => $this->_('Show caption (<figure>)'),
				'captionInputLabel' => $this->_('Caption text'),
				'captionInputPlaceholder' => $this->_('Enter image caption...'),
				'linkOriginalLabel' => $this->_('Link to full-size original image'),
				'cropToggleBtn' => $this->_('Crop'),
				'cancelCropBtn' => $this->_('Cancel Crop'),
				'rotateLeftBtn' => $this->_('Rotate 90° counter-clockwise'),
				'rotateRightBtn' => $this->_('Rotate 90° clockwise'),
				'flipHorizontalBtn' => $this->_('Flip horizontal'),
				'flipVerticalBtn' => $this->_('Flip vertical'),
				'savingVariation' => $this->_('Generating image variation...'),
				'insertImageBtn' => $this->_('Insert This Image'),
				'updateImageBtn' => $this->_('Update Image'),
				'editSelectedImage' => $this->_('Edit image settings'),
				'removeSelectedImage' => $this->_('Remove image'),
				'resizeHandleAria' => $this->_('Drag to resize image'),
			],
			'table' => [
				'controlsAria' => $this->_('Table controls'),
				'label' => $this->_('Table:'),
				'addRow' => $this->_('+ Row'),
				'deleteRow' => $this->_('- Row'),
				'addCol' => $this->_('+ Column'),
				'deleteCol' => $this->_('- Column'),
				'deleteTable' => $this->_('Delete Table'),
			],
			'status' => [
				'word' => $this->_('{count} word'),
				'words' => $this->_('{count} words'),
				'char' => $this->_('{count} char'),
				'chars' => $this->_('{count} chars'),
				'charsWithMax' => $this->_('{count} / {max} chars'),
				'readOnly' => $this->_('Read-only'),
				'switchedRichText' => $this->_('Switched to rich text view'),
				'switchedSource' => $this->_('Switched to HTML source view'),
				'linkApplied' => $this->_('Link applied'),
				'linkRemoved' => $this->_('Link removed'),
				'anchorInserted' => $this->_('Anchor inserted'),
				'anchorRemoved' => $this->_('Anchor removed'),
				'imageInserted' => $this->_('Image inserted'),
				'imageUpdated' => $this->_('Image updated'),
				'imageUploaded' => $this->_('Image uploaded and inserted'),
				'imageUploadFailed' => $this->_('Image upload failed: {error}'),
				'tableInserted' => $this->_('Table inserted'),
				'tableDeleted' => $this->_('Table deleted'),
				'hrInserted' => $this->_('Horizontal rule inserted'),
				'miniBlockInserted' => $this->_('{block} inserted'),
				'formattingCleared' => $this->_('Formatting cleared'),
				'undidChange' => $this->_('Undid last change'),
				'redidChange' => $this->_('Redid change'),
			],
			'slash' => [
				'menuAria' => $this->_('Insert block command menu'),
				'noMatches' => $this->_('No matching blocks'),
				'editorialBlocksHeading' => $this->_('Editorial blocks'),
				'basicBlocksHeading' => $this->_('Basic formatting'),
				'paragraphDesc' => $this->_('Plain body text paragraph'),
				'headingDesc' => $this->_('Section heading level {level}'),
				'bullistDesc' => $this->_('Unordered bulleted list'),
				'numlistDesc' => $this->_('Ordered numbered list'),
				'tasklistDesc' => $this->_('Interactive checklist items'),
				'blockquoteDesc' => $this->_('Standard inline quotation'),
				'codeblockDesc' => $this->_('Monospace code snippet'),
				'tableDesc' => $this->_('3x3 structured table with header row'),
				'hrDesc' => $this->_('Visual section divider line'),
			],
			'miniBlocks' => [
				'blockActions' => $this->_('Block actions'),
				'moveUp' => $this->_('Move block up'),
				'moveDown' => $this->_('Move block down'),
				'insertParagraphBelow' => $this->_('Insert paragraph below'),
				'removeBlock' => $this->_('Remove block'),
				'calloutTitlePlaceholder' => $this->_('Optional callout title...'),
				'calloutTitleAria' => $this->_('Callout title'),
				'calloutVariantAria' => $this->_('Callout style'),
				'variantInfo' => $this->_('Info'),
				'variantTip' => $this->_('Tip'),
				'variantWarning' => $this->_('Warning'),
				'variantDanger' => $this->_('Danger'),
				'figureLabel' => $this->_('Figure'),
				'figureAlignAria' => $this->_('Figure alignment'),
				'alignInline' => $this->_('Inline'),
				'alignWide' => $this->_('Wide'),
				'alignFull' => $this->_('Full'),
				'alignLeft' => $this->_('Left'),
				'alignRight' => $this->_('Right'),
				'editImageSource' => $this->_('Edit image URL and alt text'),
				'enterImageUrlHint' => $this->_('Paste an image URL above to preview the figure'),
				'captionPlaceholder' => $this->_('Optional figure caption...'),
				'captionAria' => $this->_('Figure caption'),
				'togglePreviewAria' => $this->_('Toggle accordion preview'),
				'detailsSummaryPlaceholder' => $this->_('Accordion summary title...'),
				'detailsSummaryAria' => $this->_('Accordion summary'),
				'detailsDefaultSummary' => $this->_('Details'),
				'openByDefault' => $this->_('Open by default'),
				'pullquoteLabel' => $this->_('Pullquote'),
				'citationPlaceholder' => $this->_('Citation or author (optional)...'),
				'citationAria' => $this->_('Quote citation'),
				'customBlockDescription' => $this->_('Editorial mini-block'),
			],
			'canvas' => [
				'addBlockBelow' => $this->_('Add block below'),
				'blockActions' => $this->_('Block actions (drag to reorder or click for menu)'),
				'turnInto' => $this->_('Turn into'),
				'moveUp' => $this->_('Move up'),
				'moveDown' => $this->_('Move down'),
				'duplicate' => $this->_('Duplicate'),
				'deleteBlock' => $this->_('Delete block'),
				'blockMoved' => $this->_('Block moved to position {position}'),
				'blockDuplicated' => $this->_('Block duplicated'),
				'blockDeleted' => $this->_('Block deleted'),
				'dragCancelled' => $this->_('Block reorder cancelled'),
				'loadingDialog' => $this->_('Loading dialog...'),
			],
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaShared(): array
	{
		return $this->buildReactTranslationSharedProps();
	}

	/**
	 * @param array<string, mixed> $pageObject
	 * @return array<string, mixed>
	 */
	public function inertiaViewData(array $pageObject = []): array
	{
		$workspace = $this->react();

		return [
			'scripts' => $workspace->resolveInertiaScriptAssets($this->getModuleScriptAssets()),
			'styles' => $workspace->resolveInertiaStyleAssets($this->getModuleStyleAssets()),
		];
	}

	/**
	 * Hookable registry entrypoint allowing modules or `site/ready.php` to register or customize
	 * flat editorial mini-block definitions alongside `./site/tiptap/*.{yaml,yml,php}`.
	 *
	 * @param array<string, mixed> $blocks
	 * @return array<string, mixed>
	 */
	public function ___registerMiniBlocks(array $blocks): array
	{
		return $blocks;
	}

	/**
	 * Return all normalized built-in, `./site/tiptap/*`, and hooked mini-block definitions.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function getAvailableMiniBlocks(): array
	{
		$dir = MiniBlockRegistry::resolveDirectory($this);
		$dirMtime = ($dir !== '' && is_dir($dir)) ? (int) (@filemtime($dir) ?: 0) : 0;
		$hookIds = $this->hasHook('registerMiniBlocks()')
			? implode(',', array_keys($this->getHooks('registerMiniBlocks')))
			: '';
		$user = $this->wire()->user;
		$langId = isset($user->language) && $user->language instanceof Language ? (int) $user->language->id : 0;
		$cacheKey = "{$dir}|{$dirMtime}|{$hookIds}|{$langId}";

		if ($this->availableMiniBlocksCache !== null && $this->availableMiniBlocksCacheKey === $cacheKey) {
			return $this->availableMiniBlocksCache;
		}

		$discovered = MiniBlockRegistry::discoverFromDirectory($dir);
		$hooked = $this->registerMiniBlocks($discovered);
		$normalized = MiniBlockRegistry::normalizeCatalog(
			is_array($hooked) ? $hooked : $discovered,
			fn(string $text): string => $this->_($text),
		);

		$this->availableMiniBlocksCacheKey = $cacheKey;
		$this->availableMiniBlocksCache = $normalized;

		return $normalized;
	}

	/**
	 * Render mini-blocks in `$html` through optional `./site/templates/tiptap/{name}.php` templates,
	 * preserving clean semantic HTML5 when no template override exists.
	 */
	public function renderMiniBlocks(string $html, ?Page $page = null, ?Field $field = null): string
	{
		if ($html === '' || !str_contains($html, 'data-tiptap-block')) {
			return $html;
		}

		return MiniBlockRenderer::render($html, $page, $field, $this, $this->getAvailableMiniBlocks());
	}

	/**
	 * Extract ordered `html` and structured `miniBlock` segments for React / Inertia / Headless rendering.
	 *
	 * @return list<array<string, mixed>>
	 */
	public function extractContentBlocks(string $html): array
	{
		return MiniBlockRenderer::extractBlocks($html, $this, $this->getAvailableMiniBlocks());
	}

	/**
	 * Return whether a named Tiptap feature flag (`toolbar`, `stickybars`, `bubbleMenu`,
	 * `statusbar`, `spellcheck`, `purifier`, `pasteFilter`, `sourceCode`, `slashMenu`, or `inline`) is enabled.
	 */
	public function useFeature(string $name): bool
	{
		$resolved = $this->resolveEditorSettings();
		if ($name === 'inline') {
			return (int) ($resolved['inlineMode'] ?? 0) > 0;
		}
		if ($name === 'slashMenu') {
			return !empty($resolved['slashMenu']);
		}

		return in_array($name, $resolved['features'], true);
	}

	/**
	 * Resolve effective editor configuration across:
	 * 1. Built-in defaults & selected profile preset
	 * 2. Module configuration + `defaultsJSON`
	 * 3. Optional inherited `settingsField`
	 * 4. Per-field settings + `settingsJSON` (`replace_*`, `add_*`, `append_*`)
	 *
	 * @param list<string> $htmlValues
	 * @return array{
	 *   preset: string,
	 *   toolbar: string,
	 *   toolbarGroups: list<list<string>>,
	 *   bubbleToolbar: string,
	 *   bubbleGroups: list<list<string>>,
	 *   headlines: list<string>,
	 *   features: list<string>,
	 *   toggles: list<int>,
	 *   height: int,
	 *   maxHeight: int,
	 *   inlineMode: int,
	 *   slashMenu: bool,
	 *   miniBlocks: list<string>,
	 *   preservedMiniBlocks: list<string>,
	 *   miniBlockDefs: array<string, array<string, mixed>>,
	 *   imageFields: list<string>,
	 *   extraCSS: string,
	 *   bundles: list<string>
	 * }
	 */
	public function resolveEditorSettings(array $htmlValues = []): array
	{
		$defaults = self::getDefaultConfig();
		$catalog = $this->getAvailableMiniBlocks();

		$inheritFieldName = trim((string) ($this->getSetting('settingsField') ?? ''));
		$rawOwnName = $this->attr('name');
		$ownName = is_scalar($rawOwnName) ? trim((string) $rawOwnName) : '';
		$hasInheritedSource = $inheritFieldName !== ''
			&& $inheritFieldName !== $ownName
			&& !isset(self::$resolvingFields[$inheritFieldName])
			&& $this->wire()->fields->get($inheritFieldName) instanceof Field;

		$instanceLayer = [
			'defaultsJSON' => trim((string) ($this->getSetting('defaultsJSON') ?? '')),
			'settingsField' => $inheritFieldName,
			'settingsJSON' => trim((string) ($this->getSetting('settingsJSON') ?? '')),
		];

		foreach (['preset', 'toolbar', 'bubbleToolbar', 'headlines', 'features', 'toggles', 'height', 'maxHeight', 'inlineMode', 'slashMenu', 'miniBlocks', 'imageFields', 'extraCSS'] as $key) {
			$hasExplicit = isset($this->explicitFieldOverrides[$key]);
			if (!$hasExplicit && $this->isInitialized) {
				continue;
			}
			$val = $this->getSetting($key);
			if ($val === null) {
				continue;
			}
			// Ignore default values hydrated automatically when inheriting or prior to init()
			if (($hasInheritedSource || !$this->isInitialized) && array_key_exists($key, $defaults) && $val === $defaults[$key]) {
				continue;
			}
			$instanceLayer[$key] = $val;
		}

		return TiptapContentPolicy::resolveEditorSettings($instanceLayer, $this, $catalog, $ownName, $htmlValues);
	}

	/**
	 * Sanitize custom editor CSS to prevent `<style>` tag breakout (SSR/CSR), external `@import`
	 * exfiltration, and `expression()` / `javascript:` URL vectors.
	 */
	public static function sanitizeExtraCss(string $css): string
	{
		return TiptapContentPolicy::sanitizeExtraCss($css);
	}

	/**
	 * Parse a space/comma-separated toolbar string (`|` separates groups) into clean token groups.
	 *
	 * @return list<list<string>>
	 */
	public static function parseToolbarGroups(string $toolbar): array
	{
		return TiptapContentPolicy::parseToolbarGroups($toolbar);
	}

	/**
	 * @param mixed $raw
	 * @return list<string>
	 */
	public static function normalizeHeadlines(mixed $raw): array
	{
		return TiptapContentPolicy::normalizeHeadlines($raw);
	}

	/**
	 * @param mixed $raw
	 * @return list<string>
	 */
	public static function normalizeFeatures(mixed $raw): array
	{
		return TiptapContentPolicy::normalizeFeatures($raw);
	}

	/**
	 * @param mixed $raw
	 * @return list<int>
	 */
	public static function normalizeToggles(mixed $raw): array
	{
		return TiptapContentPolicy::normalizeToggles($raw);
	}

	/**
	 * Sanitize and clean an HTML value according to active `features` (`purifier`), `toggles`, and `miniBlocks`.
	 */
	public function cleanHtmlValue(string $html): string
	{
		$trimmed = trim($html);
		if ($trimmed === '') {
			return '';
		}

		$resolved = $this->resolveEditorSettings();

		return TiptapContentPolicy::sanitizeHtml(
			$trimmed,
			$resolved,
			$this,
			fn(string $fragment): string => $this->runHtmlPurifier($fragment),
		);
	}

	/**
	 * Purify HTML via ProcessWire's `MarkupHTMLPurifier` module, throwing on unavailability or error so `TiptapContentPolicy` engages its deterministic DOM fallback.
	 */
	protected function runHtmlPurifier(string $html): string
	{
		return TiptapContentPolicy::runHtmlPurifier($html, $this);
	}

	/**
	 * Allowlist-based `DOMDocument` HTML sanitizer used when `purifier` feature is disabled or unavailable.
	 */
	protected function sanitizeHtmlWithoutPurifier(string $html): string
	{
		return TiptapContentPolicy::sanitizeHtmlWithoutPurifier($html);
	}

	/**
	 * Sanitize raw input string once per `(postKey, sha1)` on this instance.
	 */
	private function cleanSubmittedHtmlOnce(string $postKey, string $rawHtml): string
	{
		$cacheKey = $postKey . ':' . sha1($rawHtml);
		if (array_key_exists($cacheKey, $this->processedInputCache)) {
			return $this->processedInputCache[$cacheKey];
		}
		$cleaned = $this->cleanHtmlValue($rawHtml);
		$this->processedInputCache[$cacheKey] = $cleaned;

		return $cleaned;
	}

	/**
	 * Record a validation error when plain-text character count exceeds configured `maxlength`.
	 */
	private function enforceMaxLengthError(string $cleanedHtml, int $maxLength): void
	{
		if ($maxLength <= 0 || $cleanedHtml === '') {
			return;
		}
		$plainLen = TiptapContentPolicy::plainTextLength($cleanedHtml);
		if ($plainLen > $maxLength) {
			$this->error(sprintf(
				$this->_('Value exceeds maximum recommended length of %1$d characters (length=%2$d).'),
				$maxLength,
				$plainLen,
			));
		}
	}

	/**
	 * Extract language entries for multi-language `FieldtypeTextareaLanguage` / `useLanguages` fields.
	 *
	 * @return list<array{id: int, name: string, title: string, isDefault: bool, editable: bool, inputName: string, inputId: string, value: string}>
	 */
	public function extractLanguageEntries(): array
	{
		if (!$this->getSetting('useLanguages')) {
			return [];
		}

		$languages = $this->wire()->languages;
		if (!is_iterable($languages)) {
			return [];
		}

		$attrs = $this->getAttributes();
		$fieldName = (string) ($attrs['name'] ?? $this->attr('name') ?? '');
		$fieldId = (string) ($attrs['id'] ?? ($fieldName !== '' ? 'Inputfield_' . $fieldName : 'tiptap_input'));
		$entries = [];

		foreach ($languages as $lang) {
			if (!$lang instanceof Language) {
				continue;
			}
			$isDefault = $lang->isDefault();
			$langId = (int) $lang->id;
			$valKey = $isDefault ? 'value' : "value{$langId}";
			$rawVal = $attrs[$valKey] ?? $this->get($valKey) ?? ($isDefault ? $this->val() : '');
			$editable = $this->isLanguageEditable($lang);

			$entries[] = [
				'id' => $langId,
				'name' => (string) $lang->name,
				'title' => (string) ($lang->get('title|name') ?: $lang->name),
				'isDefault' => $isDefault,
				'editable' => $editable,
				'inputName' => $isDefault ? $fieldName : "{$fieldName}__{$langId}",
				'inputId' => $isDefault ? $fieldId : "{$fieldId}__{$langId}",
				'value' => is_scalar($rawVal) ? (string) $rawVal : '',
			];
		}

		return $entries;
	}

	public function isEffectivelyReadOnly(): bool
	{
		if ((bool) $this->getSetting('readOnly') || (bool) $this->get('readOnly')) {
			return true;
		}
		$collapsed = (int) ($this->collapsed ?? 0);
		if (in_array($collapsed, [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true)) {
			return true;
		}
		$isDynamicReadOnly = (bool) $this->get('_rwDynamicReadOnly');
		if ($isDynamicReadOnly) {
			return false;
		}

		return (bool) $this->attr('disabled') || (bool) $this->attr('readonly');
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		$attrs = $this->getAttributes();
		$inputName = (string) ($attrs['name'] ?? $this->attr('name') ?: $this->attr('id') ?: 'pw_tiptap');
		$inputId = (string) ($attrs['id'] ?? $this->attr('id') ?: ('Inputfield_' . $inputName));
		$isReadOnly = $this->isEffectivelyReadOnly();
		$useLanguages = (bool) $this->getSetting('useLanguages');
		$languages = $useLanguages ? $this->extractLanguageEntries() : [];
		$htmlValues = [];
		$defaultValue = (string) ($attrs['value'] ?? $this->val() ?? '');
		if ($defaultValue !== '') {
			$htmlValues[] = $defaultValue;
		}
		foreach ($languages as $langEntry) {
			$langVal = (string) ($langEntry['value'] ?? '');
			if ($langVal !== '') {
				$htmlValues[] = $langVal;
			}
		}
		$settings = $this->resolveEditorSettings($htmlValues);
		$settings['pwContext'] = $this->react()->tiptap()->buildContextForInputfield($this);
		$maxlength = $this->resolveMaxLength();
		$showCount = ((int) ($this->getSetting('showCount') ?? 0)) > 0;

		return [
			'id' => $inputId,
			'name' => $inputName,
			'value' => (string) ($attrs['value'] ?? $this->val() ?? ''),
			'placeholder' => (string) ($attrs['placeholder'] ?? $this->getSetting('placeholder') ?? ''),
			'rows' => max(2, (int) ($attrs['rows'] ?? $this->getSetting('rows') ?? 6)),
			'maxLength' => $maxlength,
			'showCount' => $showCount,
			'readOnly' => $isReadOnly,
			'disabled' => !empty($attrs['disabled']),
			'required' => (bool) $this->required,
			'useLanguages' => $useLanguages && count($languages) > 1,
			'languages' => $languages,
			'tiptapConfig' => $settings,
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function toInertiaProp(): array
	{
		$data = $this->inertiaWithData();

		return [
			'component' => $this->inertiaComponent(),
			'id' => $data['id'],
			'name' => $data['name'],
			'label' => (string) $this->label,
			'description' => (string) $this->description,
			'notes' => (string) $this->notes,
			'icon' => (string) $this->icon,
			'value' => $data['value'],
			'required' => $data['required'],
			'readOnly' => $data['readOnly'],
			'collapsed' => (int) $this->collapsed,
			'columnWidth' => (int) ($this->columnWidth ?: 100),
			'showIf' => (string) $this->showIf,
			'requiredIf' => (string) $this->requiredIf,
			'errors' => array_values(array_map('strval', $this->getErrors())),
			'useLanguages' => $data['useLanguages'],
			'languages' => $data['languages'],
			'tiptapConfig' => $data['tiptapConfig'],
			'props' => array_merge($this->getInertiaProps(), $data),
		];
	}

	public function renderReady(?Inputfield $parent = null, $renderValueMode = false): bool
	{
		$result = (bool) parent::renderReady($parent, (bool) $renderValueMode);

		return $this->enqueueInertiaIslandAssets() || $result;
	}

	public function ___render(): string
	{
		$payload = $this->inertia()->resolver->resolveValue($this->toInertiaProp());
		$data = is_array($payload) ? $payload : $this->toInertiaProp();

		$id = (string) ($data['id'] ?? ($this->attr('id') ?: 'tiptap_input'));
		$name = (string) ($data['name'] ?? $this->attr('name'));
		$component = $this->inertiaComponent();

		$safeId = $this->encodeHtmlAttribute($id);
		$safeName = $this->encodeHtmlAttribute($name);
		$out = '';
		$languages = isset($data['languages']) && is_array($data['languages']) ? $data['languages'] : [];
		if (!empty($data['useLanguages']) && count($languages) > 1) {
			foreach ($languages as $langEntry) {
				if (!is_array($langEntry)) {
					continue;
				}
				$lName = $this->encodeHtmlAttribute((string) ($langEntry['inputName'] ?? ''));
				$lId = $this->encodeHtmlAttribute((string) ($langEntry['inputId'] ?? ''));
				$lVal = htmlspecialchars((string) ($langEntry['value'] ?? ''), ENT_QUOTES, 'UTF-8');
				if ($lName !== '') {
					$out .= "<textarea id=\"{$lId}\" name=\"{$lName}\" hidden data-inertia-input=\"{$lName}\">{$lVal}</textarea>";
				}
			}
		} elseif ($name !== '') {
			$safeVal = htmlspecialchars((string) ($data['value'] ?? ''), ENT_QUOTES, 'UTF-8');
			$out .= "<textarea id=\"{$safeId}\" name=\"{$safeName}\" hidden data-inertia-input=\"{$safeName}\">{$safeVal}</textarea>";
		}

		return $out . IslandMarkup::render($component, $data, [
			'class' => 'pw-inertia-inputfield-island',
			'data-input-id' => $id,
			'data-input-name' => $name !== '' ? $name : null,
		]);
	}

	public function ___renderValue(): string
	{
		$data = $this->toInertiaProp();
		$data['readOnly'] = true;
		if (isset($data['props']) && is_array($data['props'])) {
			$data['props']['readOnly'] = true;
		}
		return IslandMarkup::render($this->inertiaComponent(), $data, ['class' => 'pw-inertia-inputfield-island']);
	}

	/**
	 * Process submitted single-language or multi-language HTML input, applying sanitization and cleanup toggles.
	 */
	public function ___processInput(WireInputData $input): self
	{
		if ((bool) $this->wire()->config->demo || $this->isEffectivelyReadOnly()) {
			return $this;
		}

		$rawName = $this->attr('name');
		$name = is_scalar($rawName) ? (string) $rawName : '';
		if ($name === '') {
			return $this;
		}

		$maxlength = $this->resolveMaxLength();
		$useLanguages = (bool) $this->getSetting('useLanguages');
		if ($useLanguages && preg_match('/^.+__(\d+)$/', $name, $langMatch) === 1) {
			if ($input[$name] === null) {
				return $this;
			}
			$targetLangId = (int) $langMatch[1];
			$targetLang = $this->wire()->languages?->get($targetLangId);
			if ($targetLang instanceof Language && !$this->isLanguageEditable($targetLang)) {
				return $this;
			}
			$cleaned = $this->cleanSubmittedHtmlOnce($name, (string) $input[$name]);
			$rawPrev = $this->attr('value');
			$previous = is_scalar($rawPrev) ? (string) $rawPrev : '';
			if ($cleaned !== $previous) {
				$this->trackChange('value', $previous, $cleaned);
				$this->setAttribute('value', $cleaned);
			}
			$this->enforceMaxLengthError($cleaned, $maxlength);

			return $this;
		}

		$languages = $useLanguages ? $this->wire()->languages : null;

		if ($useLanguages && is_iterable($languages)) {
			foreach ($languages as $lang) {
				if (!$lang instanceof Language) {
					continue;
				}
				if (!$this->isLanguageEditable($lang)) {
					continue;
				}
				$isDefault = $lang->isDefault();
				$langId = (int) $lang->id;
				$postKey = $isDefault ? $name : "{$name}__{$langId}";
				if ($input[$postKey] === null) {
					continue;
				}
				$cleaned = $this->cleanSubmittedHtmlOnce($postKey, (string) $input[$postKey]);
				$propKey = $isDefault ? 'value' : "value{$langId}";
				$rawPrevProp = $isDefault ? $this->attr('value') : $this->get($propKey);
				$prev = is_scalar($rawPrevProp) ? (string) $rawPrevProp : '';
				if ($cleaned !== $prev) {
					if ($isDefault) {
						$this->setAttribute('value', $cleaned);
					} else {
						$this->set($propKey, $cleaned);
					}
					$this->trackChange('value');
				}
				$this->enforceMaxLengthError($cleaned, $maxlength);
			}

			return $this;
		}

		if ($input[$name] === null) {
			return $this;
		}

		$cleaned = $this->cleanSubmittedHtmlOnce($name, (string) $input[$name]);
		$rawPrevVal = $this->attr('value');
		$previous = is_scalar($rawPrevVal) ? (string) $rawPrevVal : '';
		if ($cleaned !== $previous) {
			$this->trackChange('value', $previous, $cleaned);
			$this->setAttribute('value', $cleaned);
		}
		$this->enforceMaxLengthError($cleaned, $maxlength);

		return $this;
	}

	/**
	 * Per-field configuration fields shown under `Setup > Fields > [Field] > Input`.
	 */
	public function ___getConfigInputfields(): InputfieldWrapper
	{
		return TiptapConfigFormBuilder::buildFieldConfigInputfields($this, parent::___getConfigInputfields());
	}

	/**
	 * Allow overriding Tiptap settings per-template context (`Setup > Templates > [Template] > Field`).
	 *
	 * @param Field $field
	 * @return array<int, string>
	 */
	public function ___getConfigAllowContext($field): array
	{
		return array_merge(parent::___getConfigAllowContext($field), [
			'preset',
			'toolbar',
			'bubbleToolbar',
			'headlines',
			'features',
			'toggles',
			'height',
			'maxHeight',
			'inlineMode',
			'slashMenu',
			'miniBlocks',
			'imageFields',
			'settingsField',
			'settingsJSON',
		]);
	}

	/**
	 * Module-wide default configuration screen (`Modules > Configure > InputfieldTiptap`).
	 */
	public function getModuleConfigInputfields(InputfieldWrapper $inputfields): void
	{
		TiptapConfigFormBuilder::buildModuleConfigInputfields($this, $inputfields);
	}
}
