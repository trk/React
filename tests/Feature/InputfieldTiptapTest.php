<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\ConfigurableModule;
use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\InputfieldTextarea;
use ProcessWire\InputfieldTiptap;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Language;
use ProcessWire\React;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireInputData;
use Totoglu\Inertia\Contracts\InertiaSerializable;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Tiptap\TiptapAssetResolver;
use Totoglu\React\Tiptap\TiptapConfigFormBuilder;
use Totoglu\React\Tiptap\TiptapContentPolicy;
use Totoglu\React\Tiptap\TiptapPresetCatalog;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

/**
 * @param array<string, mixed> $data
 */
function makeTiptapWireInputData(array $data): WireInputData
{
	$input = new WireInputData();
	$input->setArray($data);

	return $input;
}

beforeEach(function (): void {
	bootReactForTesting();
	$this->previousUser = wire('user');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superUser = wire('users')->get($superId);
	if ($superUser instanceof User && $superUser->id > 0) {
		wire('users')->setCurrentUser($superUser);
	}
	$this->originalModuleConfig = wire('modules')->getConfig('InputfieldTiptap');
});

afterEach(function (): void {
	if (is_array($this->originalModuleConfig)) {
		wire('modules')->saveConfig('InputfieldTiptap', $this->originalModuleConfig);
	}
	if (isset($this->previousUser) && $this->previousUser instanceof User && $this->previousUser->id > 0) {
		wire('users')->setCurrentUser($this->previousUser);
	}
});

test('InputfieldTiptap extends InputfieldTextarea for native FieldtypeTextarea discovery and exposes module & field config forms', function (): void {
	$modules = wire('modules');
	expect($modules->isInstalled('InputfieldTiptap'))->toBeTrue();

	/** @var InputfieldTiptap $tiptap */
	$tiptap = $modules->get('InputfieldTiptap');
	expect($tiptap)->toBeInstanceOf(InputfieldTextarea::class)
		->and($tiptap)->toBeInstanceOf(ConfigurableModule::class)
		->and($tiptap)->toBeInstanceOf(InertiaSerializable::class)
		->and(is_subclass_of(InputfieldTiptap::class, InputfieldTextarea::class))->toBeTrue();

	$moduleWrapper = new InputfieldWrapper();
	$modules->wire($moduleWrapper);
	$tiptap->getModuleConfigInputfields($moduleWrapper);
	expect($moduleWrapper->getChildByName('toolbar'))->not->toBeNull()
		->and($moduleWrapper->getChildByName('bubbleToolbar'))->not->toBeNull()
		->and($moduleWrapper->getChildByName('headlines'))->not->toBeNull()
		->and($moduleWrapper->getChildByName('features'))->not->toBeNull()
		->and($moduleWrapper->getChildByName('toggles'))->not->toBeNull()
		->and($moduleWrapper->getChildByName('defaultsJSON'))->not->toBeNull()
		->and($moduleWrapper->getChildByName('extraCSS'))->not->toBeNull();

	$fieldConfig = $tiptap->getConfigInputfields();
	expect($fieldConfig->getChildByName('toolbar'))->not->toBeNull()
		->and($fieldConfig->getChildByName('settingsField'))->not->toBeNull()
		->and($fieldConfig->getChildByName('settingsJSON'))->not->toBeNull();

	$dummyField = new Field();
	$modules->wire($dummyField);
	$contextAllowed = $tiptap->getConfigAllowContext($dummyField);
	expect($contextAllowed)->toContain('toolbar', 'bubbleToolbar', 'headlines', 'features', 'toggles', 'settingsField', 'settingsJSON');
});

test('InputfieldTiptap resolves layered defaults, module config, defaultsJSON, and field settingsJSON with replace_/add_ prefixes', function (): void {
	$modules = wire('modules');
	$modules->saveConfig('InputfieldTiptap', [
		'toolbar' => 'styles | bold italic | link',
		'headlines' => ['h2', 'h3'],
		'defaultsJSON' => json_encode([
			'add_toolbar' => 'blockquote',
			'extraCSS' => 'p { line-height: 1.8; }',
		], JSON_THROW_ON_ERROR),
	]);

	/** @var InputfieldTiptap $tiptap */
	$tiptap = $modules->get('InputfieldTiptap');
	$resolvedFromModule = $tiptap->resolveEditorSettings();

	expect($resolvedFromModule['headlines'])->toBe(['h2', 'h3'])
		->and($resolvedFromModule['toolbarGroups'])->toBe([
			['styles'],
			['bold', 'italic'],
			['link'],
			['blockquote'],
		])
		->and($resolvedFromModule['extraCSS'])->toContain('line-height: 1.8');

	// Apply per-field overrides + settingsJSON `add_*` and `replace_*`
	$tiptap->set('headlines', ['h1', 'h2', 'h4']);
	$tiptap->set('inlineMode', 1);
	$tiptap->set('features', ['toolbar', 'bubbleMenu', 'purifier']);
	$tiptap->set('settingsJSON', json_encode([
		'add_toolbar' => 'code highlight',
		'append_features' => ['sourceCode'],
	], JSON_THROW_ON_ERROR));

	$resolvedField = $tiptap->resolveEditorSettings();
	expect($resolvedField['headlines'])->toBe(['h1', 'h2', 'h4'])
		->and($resolvedField['inlineMode'])->toBe(1)
		->and($tiptap->useFeature('inline'))->toBeTrue()
		->and($tiptap->useFeature('sourceCode'))->toBeTrue()
		->and($tiptap->useFeature('statusbar'))->toBeFalse()
		->and($resolvedField['toolbarGroups'][4])->toBe(['code', 'highlight']);

	// `replace_toolbar` replaces inherited toolbar completely
	$tiptap->set('settingsJSON', json_encode([
		'replace_toolbar' => 'bold italic | undo redo',
	], JSON_THROW_ON_ERROR));
	expect($tiptap->resolveEditorSettings()['toolbarGroups'])->toBe([
		['bold', 'italic'],
		['undo', 'redo'],
	]);
});

test('InputfieldTiptap cleanHtmlValue strips XSS vectors while preserving rich text, task lists, alignment, and cleanup toggles', function (): void {
	/** @var InputfieldTiptap $tiptap */
	$tiptap = wire('modules')->get('InputfieldTiptap');
	$tiptap->set('toggles', [
		InputfieldTiptap::toggleCleanDiv,
		InputfieldTiptap::toggleCleanP,
		InputfieldTiptap::toggleCleanNbsp,
		InputfieldTiptap::toggleRemoveStyles,
	]);

	$dirty = '<div>'
		. '<h2 style="color: red; font-size: 32px;">Section&nbsp;Title</h2>'
		. '<p style="text-align: center">Centered intro</p>'
		. '<p>&nbsp;</p>'
		. '<p><br></p>'
		. '<script>window.__xss = 1;</script>'
		. '<p onclick="alert(1)"><a href="javascript:alert(2)">Bad Link</a> and <a href="https://processwire.com" target="_blank">Good Link</a></p>'
		. '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Ship Tiptap</p></li></ul>'
		. '</div>';

	$cleaned = $tiptap->cleanHtmlValue($dirty);

	expect($cleaned)->not->toContain('<script')
		->and($cleaned)->not->toContain('onclick=')
		->and($cleaned)->not->toContain('javascript:')
		->and($cleaned)->not->toContain('<div')
		->and($cleaned)->not->toContain('&nbsp;')
		->and($cleaned)->not->toContain('color: red')
		->and($cleaned)->toContain('<h2>Section Title</h2>')
		->and($cleaned)->toContain('style="text-align: center"')
		->and($cleaned)->toContain('https://processwire.com')
		->and($cleaned)->toContain('data-type="taskList"')
		->and($cleaned)->toContain('data-checked="true"');
});

test('InputfieldTiptap processes single-language and multi-language input and renders island + SchemaForm payloads', function (): void {
	$modules = wire('modules');

	/** @var InputfieldTiptap $single */
	$single = $modules->get('InputfieldTiptap');
	$single->attr('name', 'article_body');
	$single->attr('id', 'Inputfield_article_body');
	$single->label = 'Article Body';
	$single->val('<p>Initial paragraph</p>');

	$rendered = $single->render();
	expect($rendered)->toContain('data-inertia-island="InputfieldTiptap"')
		->and($rendered)->toContain('data-inertia-input="article_body"')
		->and($rendered)->toContain('&lt;p&gt;Initial paragraph&lt;/p&gt;');

	$renderedVal = $single->renderValue();
	expect($renderedVal)->toContain('data-inertia-island="InputfieldTiptap"')
		->and($renderedVal)->toContain('&quot;readOnly&quot;:true');

	$single->processInput(makeTiptapWireInputData([
		'article_body' => '<h3>Updated</h3><script> evil() </script><p>Safe text</p><p></p>',
	]));
	expect((string) $single->val())->toBe('<h3>Updated</h3><p>Safe text</p>');

	// Multi-language (`useLanguages = true`) when Languages support is present
	$languages = wire('languages');
	if (is_iterable($languages) && count(iterator_to_array($languages)) > 1) {
		/** @var InputfieldTiptap $multi */
		$multi = $modules->get('InputfieldTiptap');
		$multi->attr('name', 'summary_html');
		$multi->attr('id', 'Inputfield_summary_html');
		$multi->set('useLanguages', true);

		$postPayload = [];
		$secondaryLangId = 0;
		foreach ($languages as $lang) {
			if (!$lang instanceof Language) {
				continue;
			}
			if ($lang->isDefault()) {
				$postPayload['summary_html'] = '<p>English rich text</p>';
			} elseif ($secondaryLangId === 0) {
				$secondaryLangId = (int) $lang->id;
				$postPayload["summary_html__{$secondaryLangId}"] = '<p>Turkish rich text</p><script>bad()</script>';
			}
		}

		$multiRendered = $multi->render();
		$multiRenderedValue = $multi->renderValue();
		expect(substr_count($multiRendered, 'data-inertia-island="InputfieldTiptap"'))->toBe(1)
			->and(substr_count($multiRendered, ' name="summary_html"'))->toBe(1)
			->and($multiRendered)->not->toContain("class='LanguageSupport'")
			->and(substr_count($multiRenderedValue, 'data-inertia-island="InputfieldTiptap"'))->toBe(1)
			->and($multiRenderedValue)->not->toContain("class='LanguageSupport'")
			->and((bool) $multi->getSetting('useLanguages'))->toBeTrue();
		if ($secondaryLangId > 0) {
			expect(substr_count($multiRendered, ' name="summary_html__' . $secondaryLangId . '"'))->toBe(1);
		}

		$multi->processInput(makeTiptapWireInputData($postPayload));
		expect((string) $multi->val())->toBe('<p>English rich text</p>');
		if ($secondaryLangId > 0) {
			expect((string) $multi->get("value{$secondaryLangId}"))->toBe('<p>Turkish rich text</p>');

			// Simulate LanguageSupport::hookInputfieldAfterProcessInput per-language pass for a role-scoped translator
			$multi->attr('name', "summary_html__{$secondaryLangId}");
			$multi->attr('value', '<p>Old Turkish</p>');
			$multi->___processInput(makeTiptapWireInputData([
				"summary_html__{$secondaryLangId}" => '<p>Translator Turkish update</p><script>xss()</script>',
			]));
			expect((string) $multi->attr('value'))->toBe('<p>Translator Turkish update</p>');
			$multi->attr('name', 'summary_html');
			$multi->attr('value', '<p>English rich text</p>');
		}

		$entries = $multi->extractLanguageEntries();
		expect(count($entries))->toBeGreaterThan(1)
			->and($entries[0]['inputName'])->toBe('summary_html');
	}

	// Verify FormSchemaSerializer & compiled dist/InputfieldTiptap.js bundle
	$wrapper = new InputfieldWrapper();
	$modules->wire($wrapper);
	$wrapper->add($single);

	$serializer = new FormSchemaSerializer();
	$modules->wire($serializer);
	$schema = $serializer->serialize($wrapper);

	expect($schema['fields'])->toHaveCount(1)
		->and($schema['fields'][0]['type'])->toBe('tiptap')
		->and($schema['fields'][0]['tiptapConfig'])->toBeArray()
		->and($schema['values']['article_body'])->toBe('<h3>Updated</h3><p>Safe text</p>');

	$declSchema = $serializer->serializeDefinitions([
		[
			'name' => 'lead_richtext',
			'type' => 'tiptap',
			'label' => 'Lead Rich Text',
			'toolbar' => 'bold italic | link',
			'headlines' => ['h2', 'h3'],
			'extraCSS' => "@import url('https://evil.example/a.css'); p { line-height: 1.6; }</style><script>x()</script>",
			'value' => '<p>Hello Tiptap</p>',
		],
	]);
	expect($declSchema['fields'][0]['type'])->toBe('tiptap')
		->and($declSchema['fields'][0]['tiptapConfig']['toolbarGroups'])->toBe([['bold', 'italic'], ['link']])
		->and($declSchema['fields'][0]['tiptapConfig']['extraCSS'])->not->toContain('@import')
		->and($declSchema['fields'][0]['tiptapConfig']['extraCSS'])->not->toContain('</style>')
		->and($declSchema['fields'][0]['tiptapConfig']['extraCSS'])->toContain('line-height: 1.6;');

	// Verify extraCSS sanitization blocks <style> breakout, @import, expression(), and javascript: URLs
	$sanitizedCss = InputfieldTiptap::sanitizeExtraCss(
		"@import url('https://evil.example/exfil.css'); p { font-size: 16px; background: url(javascript:alert(1)); width: expression(alert(1)); }</style><script>evil()</script>"
	);
	expect($sanitizedCss)->not->toContain('</style>')
		->and($sanitizedCss)->not->toContain('<script>')
		->and($sanitizedCss)->not->toContain('@import')
		->and($sanitizedCss)->not->toContain('javascript:')
		->and($sanitizedCss)->not->toContain('expression(')
		->and($sanitizedCss)->toContain('font-size: 16px;');

	$distDir = dirname(__DIR__, 2) . '/dist';
	$bundlePath = $distDir . '/TiptapCore.js';
	$stylePath = $distDir . '/TiptapCore.css';
	$coreBundlePath = $distDir . '/ReactInertia.js';
	$sharedChunks = glob($distDir . '/ReactInertia-*.js') ?: [];
	expect(is_file($bundlePath))->toBeTrue()
		->and(is_file($stylePath))->toBeTrue()
		->and(is_file($distDir . '/TiptapEditor.js'))->toBeTrue()
		->and(is_file($distDir . '/TiptapCanvas.js'))->toBeTrue()
		->and(is_file($distDir . '/TiptapBlocks.js'))->toBeTrue()
		->and(is_file($distDir . '/TiptapDialogs.js'))->toBeTrue()
		->and(is_file($distDir . '/InputfieldTiptap.js'))->toBeFalse()
		->and($sharedChunks)->toBe([])
		->and(filesize($bundlePath))->toBeGreaterThan(10_000)
		->and(filesize($bundlePath))->toBeLessThan(560 * 1024)
		->and(filesize($coreBundlePath))->toBeLessThan(700_000);
});

test('InputfieldTiptap guarantees bubbleMenu in inline chromeless mode unless bubbleToolbar is explicitly disabled and normalizes pwlink/pwimage aliases', function (): void {
	$modules = wire('modules');
	expect(TiptapContentPolicy::DEFAULT_BUBBLE_TOOLBAR)->toBe(InputfieldTiptap::defaultBubbleToolbar);

	expect(InputfieldTiptap::parseToolbarGroups('styles bold italic pwlink pwimage | clearformat'))->toBe([
		['styles', 'bold', 'italic', 'link', 'image'],
		['removeformat'],
	]);

	// Simulate an inline editor configuration where inlineMode=1 and features lacks 'bubbleMenu'
	/** @var InputfieldTiptap $inline */
	$inline = $modules->get('InputfieldTiptap');
	$inline->set('inlineMode', 1);
	$inline->set('features', ['toolbar', 'stickybars', 'purifier', 'pasteFilter']);

	$resolved = $inline->resolveEditorSettings();
	expect($resolved['inlineMode'])->toBe(1)
		->and($resolved['features'])->toContain('bubbleMenu')
		->and($inline->useFeature('inline'))->toBeTrue()
		->and($inline->useFeature('bubbleMenu'))->toBeTrue()
		->and($resolved['bubbleGroups'])->toBe([
			['bold', 'italic', 'underline', 'strike', 'code', 'highlight'],
			['link', 'removeformat'],
		]);

	// Verify TiptapContentPolicy and FormSchemaSerializer apply the exact same inline bubbleMenu invariant
	$serializer = new FormSchemaSerializer();
	$modules->wire($serializer);
	$declSchema = $serializer->serializeDefinitions([
		[
			'name' => 'inline_summary',
			'type' => 'tiptap',
			'label' => 'Inline Summary',
			'inlineMode' => 1,
			'features' => ['toolbar', 'purifier', 'pasteFilter'],
			'value' => '<p>Summary text</p>',
		],
	]);
	expect($declSchema['fields'][0]['tiptapConfig']['inlineMode'])->toBe(1)
		->and($declSchema['fields'][0]['tiptapConfig']['features'])->toContain('bubbleMenu')
		->and($declSchema['fields'][0]['tiptapConfig']['bubbleGroups'])->not->toBeEmpty();

	// Explicit opt-out (`bubbleToolbar = 'none'` or empty string) must NOT force-enable bubbleMenu
	/** @var InputfieldTiptap $disabledBubble */
	$disabledBubble = $modules->get('InputfieldTiptap');
	$disabledBubble->set('inlineMode', 1);
	$disabledBubble->set('bubbleToolbar', 'none');
	$disabledBubble->set('features', ['purifier', 'pasteFilter']);

	$disabledResolved = $disabledBubble->resolveEditorSettings();
	expect($disabledResolved['bubbleGroups'])->toBe([])
		->and($disabledResolved['features'])->not->toContain('bubbleMenu')
		->and($disabledBubble->useFeature('bubbleMenu'))->toBeFalse();
});

test('FieldtypeTextarea registers Tiptap HTML setup and TiptapContentPolicy preserves ProcessWire figure, align, hidpi, rel, and named anchors', function (): void {
	$modules = wire('modules');
	/** @var \ProcessWire\FieldtypeTextarea $ftTextarea */
	$ftTextarea = $modules->get('FieldtypeTextarea');
	$dummyField = new Field();
	$modules->wire($dummyField);
	$dummyField->type = $ftTextarea;

	$setups = $ftTextarea->getFieldSetups($dummyField);
	expect($setups)->toHaveKey('Tiptap')
		->and($setups['Tiptap']['inputfieldClass'])->toBe('InputfieldTiptap')
		->and($setups['Tiptap']['contentType'])->toBe(\ProcessWire\FieldtypeTextarea::contentTypeHTML);

	/** @var InputfieldTiptap $tiptap */
	$tiptap = $modules->get('InputfieldTiptap');
	$tiptap->set('toolbar', 'styles | bold italic | link unlink anchor image');
	$tiptap->set('imageFields', ['gallery_images', 'bad field!']);

	$resolved = $tiptap->resolveEditorSettings();
	expect($resolved['toolbarGroups'])->toContain(['link', 'unlink', 'anchor', 'image'])
		->and($resolved['features'])->toContain('imgUpload', 'imgResize')
		->and($resolved['imageFields'])->toBe(['gallery_images']);

	$pwHtml = '<h2 id="fleet-overview">Overview</h2>'
		. '<p><a id="faq-anchor"></a>Read <a href="https://processwire.com/docs/" target="_blank" rel="nofollow" class="cta-link" title="Docs">Documentation</a>.</p>'
		. '<figure class="align_left"><a href="/site/assets/files/1/vessel.png"><img src="/site/assets/files/1/vessel.400x0-is.png" alt="Vessel" width="400" class="hidpi"></a><figcaption>Flagship vessel</figcaption></figure>';

	$cleanedWithPurifier = $tiptap->cleanHtmlValue($pwHtml);
	$cleanedFallback = TiptapContentPolicy::sanitizeHtmlWithoutPurifier($pwHtml);

	foreach ([$cleanedWithPurifier, $cleanedFallback] as $cleaned) {
		expect($cleaned)->toContain('id="fleet-overview"')
			->and($cleaned)->toContain('id="faq-anchor"')
			->and($cleaned)->toContain('target="_blank"')
			->and($cleaned)->toContain('nofollow')
			->and($cleaned)->toContain('noopener')
			->and($cleaned)->toContain('<figure class="align_left">')
			->and($cleaned)->toContain('vessel.400x0-is.png')
			->and($cleaned)->toContain('width="400"')
			->and($cleaned)->toContain('class="hidpi"')
			->and($cleaned)->toContain('<figcaption>Flagship vessel</figcaption>');
	}

	expect(TiptapContentPolicy::isEmptyHtml('<p><a id="faq-anchor"></a></p>'))->toBeFalse();
});

test('TiptapMediaLinkGateway serves signed pages, files, images, inspectImage, -is resize variations, uploads, and enforces RBAC + CSRF', function (): void {
	$modules = wire('modules');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$pages = wire('pages');
	/** @var \ProcessWire\React $workspace */
	$workspace = wire('react');

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$imgFieldName = 'rw_tiptap_img_' . $suffix;
	$fileFieldName = 'rw_tiptap_doc_' . $suffix;
	$bodyFieldName = 'rw_tiptap_body_' . $suffix;
	$tplName = 'rw_tiptap_tpl_' . $suffix;
	$tmpUploadDir = sys_get_temp_dir() . '/rw_tiptap_test_' . $suffix;
	@mkdir($tmpUploadDir, 0777, true);

	$createdPages = [];
	$imgField = null;
	$fileField = null;
	$bodyField = null;
	$tpl = null;
	$fg = null;

	try {
		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = $imgFieldName;
		$imgField->label = 'Article Images';
		$imgField->set('extensions', 'png jpg jpeg webp');
		$imgField->set('maxFiles', 0);
		$fields->save($imgField);

		$fileField = new Field();
		$fileField->type = $modules->get('FieldtypeFile');
		$fileField->name = $fileFieldName;
		$fileField->label = 'Brochures';
		$fileField->set('extensions', 'txt pdf');
		$fileField->set('maxFiles', 0);
		$fields->save($fileField);

		$bodyField = new Field();
		$bodyField->type = $modules->get('FieldtypeTextarea');
		$bodyField->name = $bodyFieldName;
		$bodyField->label = 'Article Body';
		$bodyField->set('inputfieldClass', 'InputfieldTiptap');
		$fields->save($bodyField);

		$fg = new \ProcessWire\Fieldgroup();
		$fg->name = $tplName;
		$fg->add($fields->get('title'));
		$fg->add($imgField);
		$fg->add($fileField);
		$fg->add($bodyField);
		$fieldgroups->save($fg);

		$tpl = new \ProcessWire\Template();
		$tpl->name = $tplName;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$hostPage = new \ProcessWire\Page();
		$hostPage->template = $tpl;
		$hostPage->parent = $pages->get(1);
		$hostPage->name = 'rw-tiptap-host-' . $suffix;
		$hostPage->title = 'Tiptap Maritime Guide ' . $suffix;
		$pages->save($hostPage);
		$createdPages[] = $hostPage;

		$txtPath = $tmpUploadDir . '/handbook.txt';
		file_put_contents($txtPath, 'Safety checklist handbook');
		$hostPage->of(false);
		$hostPage->getUnformatted($fileFieldName)->add($txtPath);
		$pages->save($hostPage);

		/** @var InputfieldTiptap $tiptapInput */
		$tiptapInput = $hostPage->getInputfield($bodyFieldName);
		expect($tiptapInput)->toBeInstanceOf(InputfieldTiptap::class);

		// FormSchemaSerializer attaches pwContext + sibling hostMediaFields automatically
		$form = $modules->get('InputfieldForm');
		$form->add($hostPage->getInputfield($imgFieldName));
		$form->add($tiptapInput);

		$serializer = new FormSchemaSerializer();
		$modules->wire($serializer);
		$serialized = $serializer->serialize($form);
		$tiptapSchema = null;
		foreach ($serialized['fields'] as $fDef) {
			if (($fDef['name'] ?? '') === $bodyFieldName) {
				$tiptapSchema = $fDef;
				break;
			}
		}
		expect($tiptapSchema)->not->toBeNull();
		$pwContext = $tiptapSchema['tiptapConfig']['pwContext'] ?? [];
		$token = (string) ($pwContext['tiptapToken'] ?? '');
		expect($token)->not->toBe('')
			->and($pwContext['pageId'])->toBe((int) $hostPage->id)
			->and($pwContext['canUploadImages'])->toBeTrue();

		// 1. Security: Guest, missing token, tampered token, GET on mutating, and missing CSRF
		$guest = wire('users')->getGuestUser();
		$guestRes = $workspace->handleTiptapAction(['action' => 'pages', 'tiptapToken' => $token], false, $guest);
		expect($guestRes['ok'])->toBeFalse()
			->and($guestRes['status'])->toBe(403);

		$missingTokenRes = $workspace->handleTiptapAction(['action' => 'pages'], false);
		expect($missingTokenRes['ok'])->toBeFalse()
			->and($missingTokenRes['status'])->toBe(400);

		$tamperedRes = $workspace->handleTiptapAction(['action' => 'pages', 'tiptapToken' => $token . 'tampered'], false);
		expect($tamperedRes['ok'])->toBeFalse()
			->and($tamperedRes['status'])->toBe(403);

		$wrongMethodRes = $workspace->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $token,
			'_requestMethod' => 'GET',
		], true);
		expect($wrongMethodRes['ok'])->toBeFalse()
			->and($wrongMethodRes['status'])->toBe(405);

		$missingCsrfRes = $workspace->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $token,
			'_requestMethod' => 'POST',
		], true);
		expect($missingCsrfRes['ok'])->toBeFalse()
			->and($missingCsrfRes['status'])->toBe(419);

		// 2. Pages search & tree query
		$searchRes = $workspace->handleTiptapAction([
			'action' => 'pages',
			'tiptapToken' => $token,
			'q' => 'Maritime Guide ' . $suffix,
		]);
		expect($searchRes['ok'])->toBeTrue()
			->and(array_column($searchRes['items'], 'id'))->toContain((int) $hostPage->id);

		$treeRes = $workspace->handleTiptapAction([
			'action' => 'pages',
			'tiptapToken' => $token,
			'parentId' => 1,
			'includeRoot' => 1,
		]);
		expect($treeRes['ok'])->toBeTrue()
			->and($treeRes['items'][0]['isHome'])->toBeTrue();

		// 3. Files query returns attached handbook.txt
		$filesRes = $workspace->handleTiptapAction([
			'action' => 'files',
			'tiptapToken' => $token,
			'pageId' => (int) $hostPage->id,
		]);
		expect($filesRes['ok'])->toBeTrue()
			->and(array_column($filesRes['files'], 'basename'))->toContain('handbook.txt');

		// 4. Upload raster PNG via TiptapMediaLinkGateway + reject disguised SVG/script upload
		$csrfName = wire('session')->CSRF->getTokenName();
		$csrfVal = wire('session')->CSRF->getTokenValue();

		$badSvgPath = $tmpUploadDir . '/evil.svg';
		file_put_contents($badSvgPath, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
		$badUploadRes = $workspace->handleTiptapAction(
			[
				'action' => 'upload',
				'tiptapToken' => $token,
				'pageId' => (int) $hostPage->id,
				'fieldName' => $imgFieldName,
				'_requestMethod' => 'POST',
				$csrfName => $csrfVal,
			],
			true,
			null,
			[
				'files' => [
					'name' => ['evil.svg'],
					'type' => ['image/svg+xml'],
					'tmp_name' => [$badSvgPath],
					'error' => [UPLOAD_ERR_OK],
					'size' => [filesize($badSvgPath)],
				],
			],
		);
		expect($badUploadRes['ok'])->toBeFalse();

		$pngPath = $tmpUploadDir . '/harbor-photo.png';
		$gd = imagecreatetruecolor(240, 160);
		$fill = imagecolorallocate($gd, 24, 116, 205);
		imagefilledrectangle($gd, 0, 0, 240, 160, $fill);
		imagepng($gd, $pngPath);

		$uploadRes = $workspace->handleTiptapAction(
			[
				'action' => 'upload',
				'tiptapToken' => $token,
				'pageId' => (int) $hostPage->id,
				'fieldName' => $imgFieldName,
				'_requestMethod' => 'POST',
				$csrfName => $csrfVal,
			],
			true,
			null,
			[
				'files' => [
					'name' => ['harbor-photo.png'],
					'type' => ['image/png'],
					'tmp_name' => [$pngPath],
					'error' => [UPLOAD_ERR_OK],
					'size' => [filesize($pngPath)],
				],
			],
		);
		expect($uploadRes['ok'])->toBeTrue()
			->and($uploadRes['uploaded'])->toHaveCount(1)
			->and($uploadRes['uploaded'][0]['basename'])->toBe('harbor-photo.png')
			->and($uploadRes['uploaded'][0]['width'])->toBe(240)
			->and($uploadRes['uploaded'][0]['height'])->toBe(160);

		// 5. Images list & Resize `-is` variation with crop + HiDPI + inspectImage roundtrip
		$imagesRes = $workspace->handleTiptapAction([
			'action' => 'images',
			'tiptapToken' => $token,
			'pageId' => (int) $hostPage->id,
		]);
		expect($imagesRes['ok'])->toBeTrue()
			->and($imagesRes['images'])->toHaveCount(1)
			->and($imagesRes['images'][0]['basename'])->toBe('harbor-photo.png');

		$resizeRes = $workspace->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $token,
			'pageId' => (int) $hostPage->id,
			'file' => 'harbor-photo.png',
			'width' => 100,
			'hidpi' => 1,
			'crop' => ['x' => 10, 'y' => 10, 'width' => 200, 'height' => 120],
			'_requestMethod' => 'POST',
			$csrfName => $csrfVal,
		], true);

		expect($resizeRes['ok'])->toBeTrue()
			->and($resizeRes['src'])->toContain('-is')
			->and($resizeRes['originalSrc'])->toContain('harbor-photo.png')
			->and($resizeRes['hidpi'])->toBeTrue()
			->and($resizeRes['width'])->toBeLessThanOrEqual(100);

		$inspectRes = $workspace->handleTiptapAction([
			'action' => 'inspectImage',
			'tiptapToken' => $token,
			'src' => $resizeRes['src'],
		]);
		expect($inspectRes['ok'])->toBeTrue()
			->and($inspectRes['found'])->toBeTrue()
			->and($inspectRes['basename'])->toBe('harbor-photo.png')
			->and($inspectRes['originalWidth'])->toBe(240)
			->and($inspectRes['originalHeight'])->toBe(160);
	} finally {
		foreach (array_reverse($createdPages) as $p) {
			if ($p->id > 0) {
				try {
					$pages->delete($p, true);
				} catch (\Throwable) {
				}
			}
		}
		$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
		if ($tpl !== null && $tpl->id > 0) {
			$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $tpl->name)));
			try {
				$templates->delete($tpl);
			} catch (\Throwable) {
			}
			$classFile = $classesDir . $pascal . 'Page.php';
			if (is_file($classFile)) {
				unlink($classFile);
			}
		}
		if ($fg !== null && $fg->id > 0) {
			try {
				$fieldgroups->delete($fg);
			} catch (\Throwable) {
			}
		}
		foreach ([$bodyField, $fileField, $imgField] as $f) {
			if ($f !== null && $f->id > 0) {
				try {
					$fields->delete($f);
				} catch (\Throwable) {
				}
			}
		}
		if (is_dir($tmpUploadDir)) {
			foreach (glob($tmpUploadDir . '/*') ?: [] as $tmpF) {
				if (is_file($tmpF)) {
					unlink($tmpF);
				}
			}
			rmdir($tmpUploadDir);
		}
	}
});

it('handles uploads when global outputFormatting is enabled on maxFiles=1 fields and enforces no-image-field behavior', function (): void {
	$wire = wire();
	$modules = $wire->modules;
	$fields = $wire->fields;
	$fieldgroups = $wire->fieldgroups;
	$templates = $wire->templates;
	$pages = $wire->pages;
	$users = $wire->users;
	$session = $wire->session;

	$previousUser = $wire->user;
	$superuser = $users->get($wire->config->superUserPageID);
	$users->setCurrentUser($superuser);
	$prevPagesOf = $pages->of();

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$singleImgFieldName = 'rw_tp_simg_' . $suffix;
	$singleTplName = 'rw_tp_stpl_' . $suffix;
	$noImgTplName = 'rw_tp_ntpl_' . $suffix;

	$singleImgField = null;
	$singleFg = null;
	$singleTpl = null;
	$noImgFg = null;
	$noImgTpl = null;
	$createdPages = [];
	$tmpFile = sys_get_temp_dir() . '/rw_tp_of_test_' . $suffix . '.png';

	try {
		$singleImgField = new Field();
		$singleImgField->type = $modules->get('FieldtypeImage');
		$singleImgField->name = $singleImgFieldName;
		$singleImgField->label = 'Cover Image';
		$singleImgField->set('extensions', 'jpg jpeg png webp gif');
		$singleImgField->set('maxFiles', 1);
		$singleImgField->set('overwrite', 0);
		$fields->save($singleImgField);

		$singleFg = new Fieldgroup();
		$singleFg->name = $singleTplName;
		$singleFg->add($fields->get('title'));
		$singleFg->add($singleImgField);
		$fieldgroups->save($singleFg);

		$singleTpl = new Template();
		$singleTpl->name = $singleTplName;
		$singleTpl->fieldgroup = $singleFg;
		$templates->save($singleTpl);

		$noImgFg = new Fieldgroup();
		$noImgFg->name = $noImgTplName;
		$noImgFg->add($fields->get('title'));
		$fieldgroups->save($noImgFg);

		$noImgTpl = new Template();
		$noImgTpl->name = $noImgTplName;
		$noImgTpl->fieldgroup = $noImgFg;
		$templates->save($noImgTpl);

		$singlePage = $pages->new([
			'template' => $singleTpl,
			'parent' => 1,
			'name' => 'tp-single-of-' . $suffix,
			'title' => 'Single Image Host ' . $suffix,
		]);
		$createdPages[] = $singlePage;
		$singlePageId = (int) $singlePage->id;

		$noImgPage = $pages->new([
			'template' => $noImgTpl,
			'parent' => 1,
			'name' => 'tp-noimg-of-' . $suffix,
			'title' => 'No Image Host ' . $suffix,
		]);
		$createdPages[] = $noImgPage;
		$noImgPageId = (int) $noImgPage->id;

		$im = imagecreatetruecolor(80, 60);
		expect($im)->not->toBeFalse();
		$bg = imagecolorallocate($im, 40, 120, 200);
		imagefilledrectangle($im, 0, 0, 80, 60, (int) $bg);
		imagepng($im, $tmpFile);
		unset($im);

		/** @var React $workspace */
		$workspace = $modules->get('React');
		$csrfName = $session->CSRF->getTokenName();
		$csrfVal = $session->CSRF->getTokenValue();

		// 1. Simulate frontend URL hook execution (`/_react/tiptap`): global `$pages->of(true)` + cold page cache
		$token = $workspace->tiptap()->sign([
			'pageId' => $singlePageId,
			'editPageId' => $singlePageId,
			'fieldName' => 'content',
			'imageFields' => [],
		], (int) $superuser->id);

		$pages->of(true);
		$pages->uncacheAll();

		$emptyImagesRes = $workspace->handleTiptapAction([
			'action' => 'images',
			'tiptapToken' => $token,
			'pageId' => $singlePageId,
		]);
		expect($emptyImagesRes['ok'])->toBeTrue()
			->and($emptyImagesRes['hasImageFields'])->toBeTrue()
			->and($emptyImagesRes['canUpload'])->toBeTrue()
			->and($emptyImagesRes['uploadFields'])->toHaveCount(1)
			->and($emptyImagesRes['uploadFields'][0]['name'])->toBe($singleImgFieldName);

		$pages->uncacheAll();
		$uploadRes = $workspace->handleTiptapAction(
			[
				'action' => 'upload',
				'tiptapToken' => $token,
				'pageId' => $singlePageId,
				'fieldName' => $singleImgFieldName,
				'_requestMethod' => 'POST',
				$csrfName => $csrfVal,
			],
			true,
			$superuser,
			[
				'files' => [
					'name' => ['cover-upload.png'],
					'type' => ['image/png'],
					'tmp_name' => [$tmpFile],
					'error' => [UPLOAD_ERR_OK],
					'size' => [filesize($tmpFile)],
				],
			],
		);

		expect($uploadRes['ok'])->toBeTrue()
			->and($uploadRes['fieldName'])->toBe($singleImgFieldName)
			->and($uploadRes['uploaded'])->toHaveCount(1)
			->and($pages->of())->toBeTrue();

		// Once `maxFiles=1` (`overwrite=false`) holds an image, `canUpload` becomes false in modal queries
		$fullImagesRes = $workspace->handleTiptapAction([
			'action' => 'images',
			'tiptapToken' => $token,
			'pageId' => $singlePageId,
		]);
		expect($fullImagesRes['ok'])->toBeTrue()
			->and($fullImagesRes['hasImageFields'])->toBeTrue()
			->and($fullImagesRes['canUpload'])->toBeFalse()
			->and($fullImagesRes['uploadFields'])->toBe([])
			->and($fullImagesRes['images'])->toHaveCount(1);

		// 2. Page without any FieldtypeImage reports `hasImageFields=false`, `canUpload=false`, and rejects uploads with 403
		$noImgToken = $workspace->tiptap()->sign([
			'pageId' => $noImgPageId,
			'editPageId' => $noImgPageId,
			'fieldName' => 'content',
			'imageFields' => [],
		], (int) $superuser->id);

		$noImgQuery = $workspace->handleTiptapAction([
			'action' => 'images',
			'tiptapToken' => $noImgToken,
			'pageId' => $noImgPageId,
		]);
		expect($noImgQuery['ok'])->toBeTrue()
			->and($noImgQuery['hasImageFields'])->toBeFalse()
			->and($noImgQuery['canUpload'])->toBeFalse()
			->and($noImgQuery['images'])->toBe([]);

		$noImgUpload = $workspace->handleTiptapAction(
			[
				'action' => 'upload',
				'tiptapToken' => $noImgToken,
				'pageId' => $noImgPageId,
				'_requestMethod' => 'POST',
				$csrfName => $csrfVal,
			],
			true,
			$superuser,
			[
				'files' => [
					'name' => ['cover-upload.png'],
					'type' => ['image/png'],
					'tmp_name' => [$tmpFile],
					'error' => [UPLOAD_ERR_OK],
					'size' => [filesize($tmpFile)],
				],
			],
		);
		expect($noImgUpload['ok'])->toBeFalse()
			->and($noImgUpload['status'])->toBe(403);
	} finally {
		$classesDir = rtrim((string) $wire->config->paths->classes, '/') . '/';
		try {
			$pages->of($prevPagesOf);
		} catch (\Throwable) {
		}
		if (is_file($tmpFile)) {
			@unlink($tmpFile);
		}
		foreach (array_reverse($createdPages) as $p) {
			if ($p->id > 0) {
				try {
					$pages->delete($p, true);
				} catch (\Throwable) {
				}
			}
		}
		foreach ([$singleTpl, $noImgTpl] as $t) {
			if ($t !== null && $t->id > 0) {
				$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $t->name)));
				try {
					$templates->delete($t);
				} catch (\Throwable) {
				}
				$classFile = $classesDir . $pascal . 'Page.php';
				if (is_file($classFile)) {
					unlink($classFile);
				}
			}
		}
		foreach ([$singleFg, $noImgFg] as $g) {
			if ($g !== null && $g->id > 0) {
				try {
					$fieldgroups->delete($g);
				} catch (\Throwable) {
				}
			}
		}
		if ($singleImgField !== null && $singleImgField->id > 0) {
			try {
				$fields->delete($singleImgField);
			} catch (\Throwable) {
			}
		}
		if ($previousUser instanceof User && $previousUser->id > 0) {
			try {
				$users->setCurrentUser($previousUser);
			} catch (\Throwable) {
			}
		}
	}
});

test('InputfieldTiptap resolves all 4 editor presets, dynamically promotes capability packs, and omits on-demand dialogs from initial assets', function (): void {
	$modules = wire('modules');

	expect(TiptapPresetCatalog::ALL_PRESETS)->toBe(['core', 'editor', 'canvas', 'blocks'])
		->and(TiptapPresetCatalog::normalizePreset('CORE'))->toBe('core')
		->and(TiptapPresetCatalog::normalizePreset('unknown-profile'))->toBe('editor');

	// 1. Core preset loads only Core runtime (`TiptapCore.js` + `TiptapCore.css`)
	/** @var InputfieldTiptap $coreField */
	$coreField = $modules->get('InputfieldTiptap');
	$coreField->set('preset', 'core');
	$coreResolved = $coreField->resolveEditorSettings();
	expect($coreResolved['preset'])->toBe('core')
		->and($coreResolved['bundles'])->toBe(['core'])
		->and($coreResolved['slashMenu'])->toBeFalse()
		->and($coreResolved['miniBlocks'])->toBe([])
		->and($coreResolved['features'])->not->toContain('blockHandles');

	$coreScripts = implode("\n", $coreField->getModuleScriptAssets());
	$coreStyles = implode("\n", $coreField->getModuleStyleAssets());
	$coreViewData = $coreField->inertiaViewData();
	expect($coreScripts)->not->toContain('SchemaForm.js')
		->and($coreScripts)->toContain('TiptapCore.js')
		->and($coreScripts)->not->toContain('TiptapEditor.js')
		->and($coreScripts)->not->toContain('TiptapCanvas.js')
		->and($coreScripts)->not->toContain('TiptapBlocks.js')
		->and($coreScripts)->not->toContain('TiptapDialogs.js')
		->and($coreStyles)->toContain('TiptapCore.css')
		->and(implode("\n", $coreViewData['styles']))->toContain('TiptapCore.css')
		->and(implode("\n", $coreViewData['scripts']))->not->toContain('TiptapDialogs.js');

	// 2. Editor preset includes Editor + Canvas (bubbleMenu), omitting Blocks & Dialogs
	/** @var InputfieldTiptap $editorField */
	$editorField = $modules->get('InputfieldTiptap');
	$editorField->set('preset', 'editor');
	expect($editorField->resolveActiveBundles())->toBe(['core', 'editor', 'canvas']);

	// 3. Canvas preset loads Core + Canvas with `inlineMode=1`, `slashMenu`, and `blockHandles` (without heavy Editor tables)
	/** @var InputfieldTiptap $canvasField */
	$canvasField = $modules->get('InputfieldTiptap');
	$canvasField->set('preset', 'canvas');
	$canvasResolved = $canvasField->resolveEditorSettings();
	expect($canvasResolved['preset'])->toBe('canvas')
		->and($canvasResolved['inlineMode'])->toBe(1)
		->and($canvasResolved['slashMenu'])->toBeTrue()
		->and($canvasResolved['features'])->toContain('blockHandles')
		->and($canvasResolved['bundles'])->toBe(['core', 'canvas']);

	// 4. Blocks preset enables all initial capability packs (`core`, `editor`, `canvas`, `blocks`) while keeping `TiptapDialogs.js` lazy
	/** @var InputfieldTiptap $blocksField */
	$blocksField = $modules->get('InputfieldTiptap');
	$blocksField->set('preset', 'blocks');
	$blocksResolved = $blocksField->resolveEditorSettings();
	expect($blocksResolved['preset'])->toBe('blocks')
		->and($blocksResolved['bundles'])->toBe(['core', 'editor', 'canvas', 'blocks'])
		->and($blocksResolved['miniBlocks'])->toContain('callout', 'figure', 'details', 'pullquote');
	$blocksScripts = implode("\n", $blocksField->getModuleScriptAssets());
	expect($blocksScripts)->toContain('TiptapCore.js')
		->and($blocksScripts)->toContain('TiptapEditor.js')
		->and($blocksScripts)->toContain('TiptapCanvas.js')
		->and($blocksScripts)->toContain('TiptapBlocks.js')
		->and($blocksScripts)->not->toContain('TiptapDialogs.js');

	// 5. Customization & Existing HTML Content Preservation: a `core` field containing a table + callout promotes `editor` & `blocks` automatically
	$coreWithLegacyContent = $modules->get('InputfieldTiptap');
	$coreWithLegacyContent->set('preset', 'core');
	$coreWithLegacyContent->attr('value', '<table><tbody><tr><td>Cell</td></tr></tbody></table><aside data-tiptap-block="callout"><p>Notice</p></aside>');
	$promoted = $coreWithLegacyContent->resolveEditorSettings($coreWithLegacyContent->collectCurrentHtmlValues());
	expect($promoted['bundles'])->toBe(['core', 'editor', 'blocks'])
		->and($promoted['preservedMiniBlocks'])->toBe(['callout']);

	// `add_*` or custom toolbar tokens like `table` and `insertblock` also promote needed bundles via TiptapAssetResolver
	expect(TiptapAssetResolver::resolveBundles([
		'preset' => 'core',
		'toolbarGroups' => [['bold', 'table']],
		'bubbleGroups' => [],
		'features' => ['toolbar'],
		'inlineMode' => 0,
		'slashMenu' => false,
		'miniBlocks' => [],
	]))->toBe(['core', 'editor']);
});

test('TiptapConfigFormBuilder exposes preset radio options, blockHandles checkbox, and progressive preset-sync markup', function (): void {
	$modules = wire('modules');
	/** @var InputfieldTiptap $field */
	$field = $modules->get('InputfieldTiptap');
	$field->set('preset', 'canvas');

	$fieldConfigWrapper = TiptapConfigFormBuilder::buildFieldConfigInputfields($field, new InputfieldWrapper());
	$presetInput = $fieldConfigWrapper->getChildByName('preset');
	$featuresInput = $fieldConfigWrapper->getChildByName('features');
	$syncMarkup = $fieldConfigWrapper->getChildByName('_tiptap_preset_sync');

	expect($presetInput)->not->toBeNull()
		->and($presetInput->getOptions())->toHaveKeys(['core', 'editor', 'canvas', 'blocks'])
		->and($presetInput->attr('value'))->toBe('canvas')
		->and($featuresInput)->not->toBeNull()
		->and($featuresInput->getOptions())->toHaveKey('blockHandles')
		->and($syncMarkup)->not->toBeNull()
		->and((string) $syncMarkup->attr('value'))->toContain('data-rw-tiptap-preset-sync="1"');

	$moduleWrapper = new InputfieldWrapper();
	TiptapConfigFormBuilder::buildModuleConfigInputfields($field, $moduleWrapper);
	expect($moduleWrapper->getChildByName('preset'))->not->toBeNull()
		->and($moduleWrapper->getChildByName('_tiptap_preset_sync'))->not->toBeNull();
});

test('TiptapContentPolicy enforces strict attribute allowlist + iterative CSS sanitization and TiptapMediaLinkGateway enforces read-only, crop clamp, and upload rollback', function (): void {
	$modules = wire('modules');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$pages = wire('pages');
	$users = wire('users');
	/** @var React $workspace */
	$workspace = wire('react');

	// 1. Strict attribute allowlist in DOMDocument fallback (`sanitizeHtmlWithoutPurifier`)
	$dirtyHtml = '<p dir="rtl" lang="en-US" style="text-align: center" title="Greeting" contenteditable="true" popover="auto" autofocus tabindex="0">'
		. '<span style="color: red" background="/evil" usemap="#m" xml:base="https://evil.example/">Inline</span> '
		. '<a href="https://processwire.com/docs/" target="_blank" rel="nofollow" id="doc-anchor" name="doc-name" ping="https://track.example/" download="evil.exe" class="cta">Docs</a>'
		. '<img src="/site/assets/files/1/hero.png" alt="Hero" width="400" height="300" loading="lazy" decoding="async" srcset="/evil.png 2x" usemap="#imgmap">'
		. '</p>'
		. '<table width="100%"><tbody><tr><th scope="col" colspan="2" width="50%">Head</th></tr><tr><td rowspan="2" style="text-align: right">Cell</td></tr></tbody></table>'
		. '<ul data-type="taskList" data-evil="drop"><li data-type="taskItem" data-checked="true" data-other="drop">Done</li></ul>';

	$cleanedHtml = TiptapContentPolicy::sanitizeHtmlWithoutPurifier($dirtyHtml);
	expect($cleanedHtml)
		->toContain('dir="rtl"')
		->toContain('lang="en-US"')
		->toContain('style="text-align: center"')
		->toContain('title="Greeting"')
		->toContain('id="doc-anchor"')
		->toContain('name="doc-name"')
		->toContain('target="_blank"')
		->toContain('noopener')
		->toContain('noreferrer')
		->toContain('alt="Hero"')
		->toContain('loading="lazy"')
		->toContain('decoding="async"')
		->toContain('scope="col"')
		->toContain('colspan="2"')
		->toContain('rowspan="2"')
		->toContain('data-type="taskList"')
		->toContain('data-type="taskItem"')
		->toContain('data-checked="true"')
		->not->toContain('srcset=')
		->not->toContain('ping=')
		->not->toContain('download=')
		->not->toContain('contenteditable=')
		->not->toContain('popover=')
		->not->toContain('autofocus')
		->not->toContain('tabindex=')
		->not->toContain('background=')
		->not->toContain('usemap=')
		->not->toContain('xml:base')
		->not->toContain('color: red')
		->not->toContain('data-evil=')
		->not->toContain('data-other=');

	// 2. Iterative CSS breakout sanitization
	$dirtyCss = 'body{color:red} <<//style><img src=x onerror=alert(1)>';
	$cleanCss = TiptapContentPolicy::sanitizeExtraCss($dirtyCss);
	expect($cleanCss)->toContain('body{color:red}')
		->and($cleanCss)->not->toContain('<')
		->and(strtolower($cleanCss))->not->toContain('</style')
		->and(strtolower($cleanCss))->not->toContain('<img');

	// 3. TiptapMediaLinkGateway: mediaToken readOnly inspectImage/resize, crop y-clamp, and multi-file upload rollback
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$imgFieldName = 'rw_tt_sec_img_' . $suffix;
	$bodyFieldName = 'rw_tt_sec_body_' . $suffix;
	$tplName = 'rw_tt_sec_tpl_' . $suffix;

	$imgField = null;
	$bodyField = null;
	$fg = null;
	$tpl = null;
	$hostPage = null;
	$tmpDir = sys_get_temp_dir() . '/rw_tt_sec_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$prevUser = wire('user');

	try {
		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = $imgFieldName;
		$imgField->label = 'Gallery';
		$imgField->set('extensions', 'png jpg');
		$fields->save($imgField);

		$bodyField = new Field();
		$bodyField->type = $modules->get('FieldtypeTextarea');
		$bodyField->name = $bodyFieldName;
		$bodyField->label = 'Body';
		$bodyField->set('inputfieldClass', 'InputfieldTiptap');
		$fields->save($bodyField);

		$fg = new \ProcessWire\Fieldgroup();
		$fg->name = $tplName;
		$fg->add($fields->get('title'));
		$fg->add($imgField);
		$fg->add($bodyField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $tplName;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$hostPage = new \ProcessWire\Page();
		$hostPage->template = $tpl;
		$hostPage->parent = $pages->get(1);
		$hostPage->name = 'tt-sec-host-' . $suffix;
		$hostPage->title = 'Tiptap Security Host';
		$pages->save($hostPage);

		$seedPng = $tmpDir . '/seed.png';
		$gdSeed = imagecreatetruecolor(24, 16);
		$blue = imagecolorallocate($gdSeed, 20, 90, 180);
		imagefilledrectangle($gdSeed, 0, 0, 24, 16, $blue);
		imagepng($gdSeed, $seedPng);

		$hostPage->of(false);
		$hostPage->getUnformatted($imgFieldName)->add($seedPng);
		$hostPage->save($imgFieldName);
		$seedImg = $hostPage->getUnformatted($imgFieldName)->first();
		expect($seedImg)->not->toBeNull();

		$superId = (int) $users->getCurrentUser()->id;
		$csrf = wire('session')->CSRF;
		$csrfName = (string) $csrf->getTokenName();
		$csrfVal = (string) $csrf->getTokenValue();

		$tiptapToken = $workspace->tiptap()->sign([
			'pageId' => (int) $hostPage->id,
			'fieldName' => $bodyFieldName,
			'imgUpload' => true,
			'imgResize' => true,
			'imageFields' => [$imgFieldName],
		], $superId);

		$writableMediaToken = $workspace->media()->sign([
			'kind' => 'page',
			'isImage' => true,
			'pageId' => (int) $hostPage->id,
			'rootPageId' => (int) $hostPage->id,
			'fieldName' => $imgFieldName,
			'extensions' => ['png', 'jpg'],
			'readOnly' => false,
		], $superId);

		$readOnlyMediaToken = $workspace->media()->sign([
			'kind' => 'page',
			'isImage' => true,
			'pageId' => (int) $hostPage->id,
			'rootPageId' => (int) $hostPage->id,
			'fieldName' => $imgFieldName,
			'extensions' => ['png', 'jpg'],
			'readOnly' => true,
		], $superId);

		$inspectWritable = $workspace->handleTiptapAction([
			'action' => 'inspectImage',
			'tiptapToken' => $tiptapToken,
			'mediaToken' => $writableMediaToken,
			'src' => (string) $seedImg->url(),
		]);
		expect($inspectWritable['ok'])->toBeTrue()
			->and($inspectWritable['canEditImages'])->toBeTrue();

		$inspectReadOnly = $workspace->handleTiptapAction([
			'action' => 'inspectImage',
			'tiptapToken' => $tiptapToken,
			'mediaToken' => $readOnlyMediaToken,
			'src' => (string) $seedImg->url(),
		]);
		expect($inspectReadOnly['ok'])->toBeTrue()
			->and($inspectReadOnly['canEditImages'])->toBeFalse();

		$resizeReadOnly = $workspace->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $tiptapToken,
			'mediaToken' => $readOnlyMediaToken,
			'file' => (string) $seedImg->basename(),
			'width' => 12,
			'_requestMethod' => 'POST',
			$csrfName => $csrfVal,
		], true);
		expect($resizeReadOnly['ok'])->toBeFalse()
			->and($resizeReadOnly['status'])->toBe(403);

		// Non-editable user gets 403 on resize
		$guestId = (int) (wire('config')->guestUserPageID ?: 40);
		$guestUser = $users->get($guestId);
		$guestTiptapToken = $workspace->tiptap()->sign([
			'pageId' => (int) $hostPage->id,
			'fieldName' => $bodyFieldName,
			'imgUpload' => true,
			'imgResize' => true,
			'imageFields' => [$imgFieldName],
		], $guestId);
		$guestMediaToken = $workspace->media()->sign([
			'kind' => 'page',
			'isImage' => true,
			'pageId' => (int) $hostPage->id,
			'rootPageId' => (int) $hostPage->id,
			'fieldName' => $imgFieldName,
			'extensions' => ['png', 'jpg'],
			'readOnly' => false,
		], $guestId);
		$users->setCurrentUser($guestUser);
		$nonEditResize = $workspace->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $guestTiptapToken,
			'mediaToken' => $guestMediaToken,
			'file' => (string) $seedImg->basename(),
			'width' => 12,
			'_requestMethod' => 'POST',
			$csrfName => $csrfVal,
		], false);
		expect($nonEditResize['ok'])->toBeFalse()
			->and($nonEditResize['status'])->toBe(403);

		// Restore superuser and verify crop $cy >= $origH clamps to $origH - 1 (15, not 0)
		$users->setCurrentUser($prevUser);
		$clampedCrop = $workspace->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $tiptapToken,
			'pageId' => (int) $hostPage->id,
			'file' => (string) $seedImg->basename(),
			'width' => 6,
			'crop' => ['x' => 0, 'y' => 9999, 'width' => 10, 'height' => 10],
			'_requestMethod' => 'POST',
			$csrfName => $csrfVal,
		], true);
		expect($clampedCrop['ok'])->toBeTrue()
			->and((string) ($clampedCrop['src'] ?? ''))->toContain('cropx0y15');

		// Multi-file upload rollback: 1st file valid raster PNG, 2nd file exceeds MAX_RASTER_AXIS (8200x1 PNG)
		$validUpload = $tmpDir . '/batch-valid-one.png';
		$gdOne = imagecreatetruecolor(16, 16);
		$green = imagecolorallocate($gdOne, 30, 160, 80);
		imagefilledrectangle($gdOne, 0, 0, 16, 16, $green);
		imagepng($gdOne, $validUpload);

		$oversizedUpload = $tmpDir . '/batch-oversized-two.png';
		$gdTwo = imagecreatetruecolor(8200, 1);
		$red = imagecolorallocate($gdTwo, 200, 40, 40);
		imagefilledrectangle($gdTwo, 0, 0, 8200, 1, $red);
		imagepng($gdTwo, $oversizedUpload);

		$batchRes = $workspace->handleTiptapAction(
			[
				'action' => 'upload',
				'tiptapToken' => $tiptapToken,
				'pageId' => (int) $hostPage->id,
				'fieldName' => $imgFieldName,
				'_requestMethod' => 'POST',
				$csrfName => $csrfVal,
			],
			true,
			null,
			[
				'files' => [
					'name' => ['batch-valid-one.png', 'batch-oversized-two.png'],
					'type' => ['image/png', 'image/png'],
					'tmp_name' => [$validUpload, $oversizedUpload],
					'error' => [UPLOAD_ERR_OK, UPLOAD_ERR_OK],
					'size' => [filesize($validUpload), filesize($oversizedUpload)],
				],
			],
		);
		expect($batchRes['ok'])->toBeFalse()
			->and($batchRes['status'])->toBe(422);

		$pages->uncacheAll();
		$reloaded = $pages->get((int) $hostPage->id);
		$reloaded->of(false);
		$filesPath = rtrim((string) $reloaded->filesManager()->path(), '/') . '/';
		expect($reloaded->getUnformatted($imgFieldName)->count())->toBe(1)
			->and(is_file($filesPath . 'batch-valid-one.png'))->toBeFalse();
	} finally {
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
		if ($hostPage !== null && $hostPage->id > 0) {
			try {
				$pages->delete($hostPage, true);
			} catch (\Throwable) {
			}
		}
		$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
		if ($tpl !== null && $tpl->id > 0) {
			$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $tpl->name)));
			try {
				$templates->delete($tpl);
			} catch (\Throwable) {
			}
			$classFile = $classesDir . $pascal . 'Page.php';
			if (is_file($classFile)) {
				unlink($classFile);
			}
		}
		if ($fg !== null && $fg->id > 0) {
			try {
				$fieldgroups->delete($fg);
			} catch (\Throwable) {
			}
		}
		foreach ([$imgField, $bodyField] as $f) {
			if ($f !== null && $f->id > 0) {
				try {
					$fields->delete($f);
				} catch (\Throwable) {
				}
			}
		}
		if (is_dir($tmpDir)) {
			foreach (glob($tmpDir . '/*') ?: [] as $tmpFile) {
				if (is_file($tmpFile)) {
					unlink($tmpFile);
				}
			}
			rmdir($tmpDir);
		}
	}
});
