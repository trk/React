<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\HookEvent;
use ProcessWire\InputfieldTiptap;
use ProcessWire\User;
use Totoglu\React\Form\FormSchemaSerializer;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
	$this->previousUser = wire('user');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superUser = wire('users')->get($superId);
	if ($superUser instanceof User && $superUser->id > 0) {
		wire('users')->setCurrentUser($superUser);
	}
	$this->originalModuleConfig = wire('modules')->getConfig('InputfieldTiptap');
	$this->tempTiptapDir = sys_get_temp_dir() . '/pw_tiptap_mb_' . bin2hex(random_bytes(6));
	$this->tempTemplatesDir = sys_get_temp_dir() . '/pw_tiptap_tpl_' . bin2hex(random_bytes(6));
	mkdir($this->tempTiptapDir, 0777, true);
	mkdir($this->tempTemplatesDir, 0777, true);
	wire('config')->tiptapBlocksPath = $this->tempTiptapDir;
	wire('config')->tiptapTemplatesPath = $this->tempTemplatesDir;
});

afterEach(function (): void {
	wire('config')->tiptapBlocksPath = null;
	wire('config')->tiptapTemplatesPath = null;
	foreach ([$this->tempTiptapDir ?? null, $this->tempTemplatesDir ?? null] as $dir) {
		if (is_string($dir) && is_dir($dir)) {
			foreach (glob($dir . '/*') ?: [] as $f) {
				@unlink($f);
			}
			@rmdir($dir);
		}
	}
	if (is_array($this->originalModuleConfig)) {
		wire('modules')->saveConfig('InputfieldTiptap', $this->originalModuleConfig);
	}
	if (isset($this->previousUser) && $this->previousUser instanceof User && $this->previousUser->id > 0) {
		wire('users')->setCurrentUser($this->previousUser);
	}
});

test('InputfieldTiptap keeps slashMenu and miniBlocks opt-in by default and discovers built-in, YAML, PHP, and hooked custom mini-blocks', function (): void {
	file_put_contents(
		$this->tempTiptapDir . '/cta_banner.yaml',
		<<<'YAML'
name: cta_banner
label: CTA Banner
description: Highlighted call-to-action card with button link
icon: megaphone
tag: aside
editableBody: true
keywords: [cta, button, banner]
fields:
  heading:
    type: text
    label: Heading
    placeholder: Ready to start?
    required: true
  button_label:
    type: text
    label: Button text
    default: Learn more
  button_url:
    type: url
    label: Button URL
  theme:
    type: select
    label: Theme
    default: primary
    options:
      primary: Primary
      subtle: Subtle
  new_tab:
    type: toggle
    label: Open in new tab
    default: false
YAML
	);

	file_put_contents(
		$this->tempTiptapDir . '/stat_badge.php',
		<<<'PHP'
<?php
return [
	'label' => 'Stat Highlight',
	'tag' => 'script', // Invalid tag must fall back safely to 'div'
	'editableBody' => false,
	'fields' => [
		'metric' => ['type' => 'text', 'label' => 'Metric', 'default' => '99.9%'],
		'caption' => ['type' => 'text', 'label' => 'Caption'],
	],
];
PHP
	);

	$hookId = wire()->addHookAfter('InputfieldTiptap::registerMiniBlocks', function (HookEvent $event): void {
		$blocks = (array) $event->return;
		$blocks['author_note'] = [
			'name' => 'author_note',
			'label' => 'Author Note',
			'tag' => 'aside',
			'editableBody' => true,
			'fields' => [
				'author' => ['type' => 'text', 'label' => 'Author'],
			],
		];
		$event->return = $blocks;
	});

	try {
		/** @var InputfieldTiptap $defaultEditor */
		$defaultEditor = wire('modules')->get('InputfieldTiptap');
		$defaultSettings = $defaultEditor->resolveEditorSettings();

		// Opt-in invariant: short/default fields have slashMenu disabled and zero active miniBlocks
		expect($defaultSettings['slashMenu'])->toBeFalse()
			->and($defaultSettings['miniBlocks'])->toBe([])
			->and($defaultSettings['miniBlockDefs'])->toBe([]);

		// Catalog exposes built-ins + YAML + PHP + hooked definitions
		$catalog = $defaultEditor->getAvailableMiniBlocks();
		expect($catalog)->toHaveKeys(['callout', 'figure', 'details', 'pullquote', 'cta_banner', 'stat_badge', 'author_note'])
			->and($catalog['cta_banner']['kind'])->toBe('custom')
			->and($catalog['cta_banner']['tag'])->toBe('aside')
			->and($catalog['cta_banner']['editableBody'])->toBeTrue()
			->and($catalog['cta_banner']['fields'])->toHaveCount(5)
			->and($catalog['stat_badge']['tag'])->toBe('div')
			->and($catalog['author_note']['label'])->toBe('Author Note');

		// Opt-in on an article field activates slashMenu and filters miniBlockDefs to selected blocks
		/** @var InputfieldTiptap $articleEditor */
		$articleEditor = wire('modules')->get('InputfieldTiptap');
		$articleEditor->attr('name', 'article_body');
		$articleEditor->set('miniBlocks', ['callout', 'figure', 'cta_banner', 'author_note']);
		$articleSettings = $articleEditor->resolveEditorSettings();

		expect($articleSettings['slashMenu'])->toBeTrue()
			->and($articleSettings['miniBlocks'])->toBe(['callout', 'figure', 'cta_banner', 'author_note'])
			->and(array_keys($articleSettings['miniBlockDefs']))->toBe(['callout', 'figure', 'cta_banner', 'author_note']);

		// FormSchemaSerializer preserves miniBlocks and miniBlockDefs across both Inputfield and declarative paths
		$serializer = new FormSchemaSerializer();
		wire($serializer);
		$form = wire('modules')->get('InputfieldForm');
		$form->add($articleEditor);
		$serialized = $serializer->serialize($form);
		$node = $serialized['fields'][0] ?? [];
		expect($node['tiptapConfig']['slashMenu'] ?? null)->toBeTrue()
			->and($node['tiptapConfig']['miniBlocks'] ?? null)->toBe(['callout', 'figure', 'cta_banner', 'author_note'])
			->and(array_keys($node['tiptapConfig']['miniBlockDefs'] ?? []))->toBe(['callout', 'figure', 'cta_banner', 'author_note']);

		$declarative = $serializer->serializeDefinitions([
			[
				'name' => 'lead_copy',
				'type' => 'tiptap',
				'miniBlocks' => ['callout', 'cta_banner'],
			],
		]);
		$declNode = $declarative['fields'][0] ?? [];
		expect($declNode['tiptapConfig']['slashMenu'] ?? null)->toBeTrue()
			->and($declNode['tiptapConfig']['miniBlocks'] ?? null)->toBe(['callout', 'cta_banner'])
			->and(array_keys($declNode['tiptapConfig']['miniBlockDefs'] ?? []))->toBe(['callout', 'cta_banner']);
	} finally {
		wire()->removeHook($hookId);
	}
});

test('InputfieldTiptap cleanHtmlValue preserves enabled flat mini-blocks across HTMLPurifier, DOM sanitizer, and toggleCleanDiv while stripping XSS, nested blocks, and disabled blocks', function (): void {
	file_put_contents(
		$this->tempTiptapDir . '/cta_banner.yaml',
		<<<'YAML'
name: cta_banner
label: CTA Banner
tag: aside
editableBody: true
fields:
  heading:
    type: text
    label: Heading
  button_url:
    type: url
    label: Button URL
  hero_image:
    type: image
    label: Hero Image
  theme:
    type: select
    default: primary
    options:
      primary: Primary
      subtle: Subtle
  new_tab:
    type: toggle
    default: false
YAML
	);

	file_put_contents(
		$this->tempTiptapDir . '/stat_badge.yaml',
		<<<'YAML'
name: stat_badge
label: Stat Badge
tag: div
editableBody: false
fields:
  metric:
    type: text
    label: Metric
  caption:
    type: text
    label: Caption
YAML
	);

	$dirtyHtml = <<<'HTML'
<p>Lead paragraph.</p>
<aside data-tiptap-block="callout" data-variant="warning" data-title="Heads &lt;script&gt;alert(1)&lt;/script&gt; up" data-evil="1" onclick="alert(1)">
	<p>Check <strong>deployment</strong> notes and <a href="https://processwire.com">docs</a>.</p>
	<aside data-tiptap-block="callout" data-variant="danger" data-title="Nested illegal">
		<p>Flattened nested paragraph.</p>
	</aside>
</aside>
<figure data-tiptap-block="figure" data-align="wide" onmouseover="evil()">
	<img src="https://example.com/photo.jpg" alt="Architecture diagram" onerror="alert(1)">
	<figcaption>Figure 1: System topology</figcaption>
</figure>
<figure data-tiptap-block="figure" data-align="full">
	<img src="javascript:alert(1)" alt="Malicious image">
</figure>
<details data-tiptap-block="details" open>
	<summary><h3>Why flat mini-blocks?</h3></summary>
	<div data-tiptap-details-body="1">
		<p>Because rich prose stays clean and fast.</p>
	</div>
</details>
<figure data-tiptap-block="pullquote">
	<blockquote data-tiptap-quote="1"><p>Simplicity is prerequisite for reliability.</p></blockquote>
	<figcaption>Edsger W. Dijkstra</figcaption>
</figure>
<aside data-tiptap-block="cta_banner" data-prop-heading="Start today" data-prop-button-url="javascript:alert(1)" data-prop-hero-image="mailto:bad@example.com" data-prop-theme="invalid_theme" data-prop-new-tab="true" data-prop-undeclared="hack">
	<div data-tiptap-body="1"><p>Ready when you are.</p></div>
</aside>
<div data-tiptap-block="stat_badge" data-prop-metric="99.98%" data-prop-caption="Uptime SLA"></div>
HTML;

	// 1. With HTMLPurifier ENABLED + toggleCleanDiv ENABLED
	/** @var InputfieldTiptap $editor */
	$editor = wire('modules')->get('InputfieldTiptap');
	$editor->set('miniBlocks', ['callout', 'figure', 'details', 'pullquote', 'cta_banner']); // Note: stat_badge intentionally NOT enabled
	$editor->set('toggles', [InputfieldTiptap::toggleCleanDiv]);

	$cleanedPurifier = $editor->cleanHtmlValue($dirtyHtml);

	expect($cleanedPurifier)
		->toContain('data-tiptap-block="callout"')
		->toContain('data-variant="warning"')
		->toContain('data-title="Heads up"')
		->not->toContain('data-evil')
		->not->toContain('onclick')
		->not->toContain('Nested illegal')
		->toContain('Flattened nested paragraph.')
		->toContain('<figure data-tiptap-block="figure" data-align="wide"><img src="https://example.com/photo.jpg" alt="Architecture diagram"><figcaption>Figure 1: System topology</figcaption></figure>')
		->not->toContain('javascript:')
		->not->toContain('Malicious image')
		->toContain('<details data-tiptap-block="details" open><summary>Why flat mini-blocks?</summary><div data-tiptap-details-body="1"><p>Because rich prose stays clean and fast.</p></div></details>')
		->not->toContain('<summary><h3>')
		->toContain('<figure data-tiptap-block="pullquote"><blockquote data-tiptap-quote="1"><p>Simplicity is prerequisite for reliability.</p></blockquote><figcaption>Edsger W. Dijkstra</figcaption></figure>')
		->toContain('data-tiptap-block="cta_banner"')
		->toContain('data-prop-heading="Start today"')
		->toContain('data-prop-button-url=""')
		->toContain('data-prop-hero-image=""')
		->toContain('data-prop-theme="primary"')
		->toContain('data-prop-new-tab="1"')
		->not->toContain('data-prop-undeclared')
		->toContain('<div data-tiptap-body="1"><p>Ready when you are.</p></div>')
		->not->toContain('data-tiptap-block="stat_badge"');

	// Verify zero nested [data-tiptap-block] inside another [data-tiptap-block]
	$prevLibxml = libxml_use_internal_errors(true);
	$dom = new \DOMDocument('1.0', 'UTF-8');
	$dom->loadHTML('<?xml encoding="utf-8" ?><div>' . $cleanedPurifier . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
	libxml_clear_errors();
	libxml_use_internal_errors($prevLibxml);
	$xpath = new \DOMXPath($dom);
	$nestedBlocks = $xpath->query('//*[@data-tiptap-block]//*[@data-tiptap-block]');
	expect($nestedBlocks !== false ? $nestedBlocks->length : 0)->toBe(0);

	// 2. With HTMLPurifier DISABLED (DOMDocument allowlist sanitizer) + stat_badge ENABLED
	/** @var InputfieldTiptap $domEditor */
	$domEditor = wire('modules')->get('InputfieldTiptap');
	$domEditor->set('features', ['toolbar', 'pasteFilter']); // purifier omitted
	$domEditor->set('miniBlocks', ['callout', 'figure', 'details', 'pullquote', 'cta_banner', 'stat_badge']);

	$cleanedDom = $domEditor->cleanHtmlValue($dirtyHtml);
	expect($cleanedDom)
		->toContain('data-tiptap-block="callout"')
		->toContain('data-tiptap-block="figure"')
		->toContain('data-tiptap-block="details"')
		->toContain('data-tiptap-block="pullquote"')
		->toContain('data-tiptap-block="cta_banner"')
		->toContain('data-tiptap-block="stat_badge"')
		->toContain('data-prop-metric="99.98%"')
		->not->toContain('onerror')
		->not->toContain('onmouseover')
		->not->toContain('javascript:');
});

test('InputfieldTiptap renderMiniBlocks, extractContentBlocks, and TextformatterTiptapMiniBlocks render optional PHP templates while keeping semantic HTML fallback', function (): void {
	file_put_contents(
		$this->tempTiptapDir . '/cta_banner.yaml',
		<<<'YAML'
name: cta_banner
label: CTA Banner
tag: aside
editableBody: true
fields:
  heading:
    type: text
  button_url:
    type: url
  new_tab:
    type: toggle
    default: false
YAML
	);

	file_put_contents(
		$this->tempTemplatesDir . '/cta_banner.php',
		<<<'PHP'
<?php
/** @var array<string, mixed> $block */
/** @var array<string, mixed> $props */
/** @var string $body */
$target = !empty($props['new_tab']) ? ' target="_blank" rel="noopener"' : '';
?>
<section class="custom-cta-banner">
	<h4><?= htmlspecialchars((string) ($props['heading'] ?? ''), ENT_QUOTES, 'UTF-8') ?></h4>
	<div class="custom-cta-copy"><?= $body ?></div>
	<a href="<?= htmlspecialchars((string) ($props['button_url'] ?? ''), ENT_QUOTES, 'UTF-8') ?>"<?= $target ?>>Action</a>
</section>
PHP
	);

	$storedHtml = <<<'HTML'
<p>Opening paragraph.</p>
<aside data-tiptap-block="callout" data-variant="tip" data-title="Quick tip"><p>Keep blocks flat.</p></aside>
<aside data-tiptap-block="cta_banner" data-prop-heading="Ship faster" data-prop-button-url="https://processwire.com/docs/" data-prop-new-tab="1"><div data-tiptap-body="1"><p>Zero rebuild required.</p></div></aside>
<p>Closing paragraph.</p>
HTML;

	/** @var InputfieldTiptap $editor */
	$editor = wire('modules')->get('InputfieldTiptap');

	// Fast bypass when no mini-blocks exist
	$plain = '<p>Plain paragraph without mini-blocks.</p>';
	expect($editor->renderMiniBlocks($plain))->toBe($plain);

	// Renders cta_banner through ./site/templates/tiptap/cta_banner.php while keeping callout's semantic HTML
	$rendered = $editor->renderMiniBlocks($storedHtml);
	expect($rendered)
		->toContain('<aside data-tiptap-block="callout" data-variant="tip" data-title="Quick tip"><p>Keep blocks flat.</p></aside>')
		->toContain('<section class="custom-cta-banner">')
		->toContain('<h4>Ship faster</h4>')
		->toContain('<div class="custom-cta-copy"><p>Zero rebuild required.</p></div>')
		->toContain('href="https://processwire.com/docs/" target="_blank" rel="noopener"')
		->not->toContain('data-tiptap-block="cta_banner"');

	// Structured extraction for React / Inertia / Headless consumers
	$segments = $editor->extractContentBlocks($storedHtml);
	expect($segments)->toHaveCount(4)
		->and($segments[0]['type'])->toBe('html')
		->and($segments[1]['type'])->toBe('miniBlock')
		->and($segments[1]['name'])->toBe('callout')
		->and($segments[1]['props'])->toBe(['variant' => 'tip', 'title' => 'Quick tip'])
		->and($segments[2]['type'])->toBe('miniBlock')
		->and($segments[2]['name'])->toBe('cta_banner')
		->and($segments[2]['props'])->toBe([
			'heading' => 'Ship faster',
			'button_url' => 'https://processwire.com/docs/',
			'new_tab' => true,
		])
		->and($segments[2]['body'])->toBe('<p>Zero rebuild required.</p>')
		->and($segments[3]['type'])->toBe('html');

	// Companion TextformatterTiptapMiniBlocks module formats string by reference
	require_once dirname(__DIR__, 2) . '/TextformatterTiptapMiniBlocks.module.php';
	$formatter = new \ProcessWire\TextformatterTiptapMiniBlocks();
	wire($formatter);
	$formattedValue = $storedHtml;
	$formatter->format($formattedValue);
	expect($formattedValue)->toContain('<section class="custom-cta-banner">')
		->and($formattedValue)->toContain('<h4>Ship faster</h4>');
});

test('TiptapContentPolicy evaluates empty HTML, plain-text length, searchable text, and CSS breakout vectors accurately', function (): void {
	$policyClass = \Totoglu\React\Tiptap\TiptapContentPolicy::class;
	expect(class_exists($policyClass))->toBeTrue();

	expect($policyClass::isEmptyHtml(''))->toBeTrue()
		->and($policyClass::isEmptyHtml('<p></p>'))->toBeTrue()
		->and($policyClass::isEmptyHtml('<p><br></p>'))->toBeTrue()
		->and($policyClass::isEmptyHtml('<p>&nbsp; &#160;</p>'))->toBeTrue()
		->and($policyClass::isEmptyHtml('<h2>   </h2>'))->toBeTrue()
		->and($policyClass::isEmptyHtml('<aside data-tiptap-block="callout" data-variant="info"><p><br></p></aside>'))->toBeTrue()
		->and($policyClass::isEmptyHtml('<p>Hello</p>'))->toBeFalse()
		->and($policyClass::isEmptyHtml('<p><img src="/site/assets/files/1/photo.jpg" alt=""></p>'))->toBeFalse()
		->and($policyClass::isEmptyHtml('<hr>'))->toBeFalse()
		->and($policyClass::isEmptyHtml('<div data-tiptap-block="stat_badge" data-prop-metric="99.9%"></div>'))->toBeFalse();

	expect($policyClass::plainTextLength('<p><strong>Hello</strong> <em>world</em>!</p>'))->toBe(12)
		->and($policyClass::plainTextLength('<p>&amp;</p>'))->toBe(1);

	$searchable = $policyClass::extractSearchableText(
		'<p>Lead copy.</p><aside data-tiptap-block="callout" data-variant="tip" data-title="Pro Tip"><p>Nested advice</p></aside><div data-tiptap-block="stat_badge" data-prop-metric="99.98%"></div>'
	);
	expect($searchable)->toContain('Lead copy.')
		->toContain('Pro Tip')
		->toContain('Nested advice')
		->toContain('99.98%');

	// Unclosed <style / </style breakout and CSS backslash escapes are stripped
	$dirtyCss = ".rw-tiptap-prose p { color: red; } </style ><script>alert(1)</script> @\\69mport url('https://evil.test/x.css'); width: expr\\65ssion(alert(1));";
	$safeCss = \ProcessWire\InputfieldTiptap::sanitizeExtraCss($dirtyCss);
	expect($safeCss)->not->toContain('</style')
		->not->toContain('<script')
		->not->toContain('evil.test')
		->not->toContain('alert(1)');
});

test('InputfieldTiptap inherits settingsField configuration on real saved ProcessWire Fields unless explicitly overridden', function (): void {
	$fields = wire('fields');
	$masterName = 'pw_test_tiptap_master_' . uniqid();
	$childName = 'pw_test_tiptap_child_' . uniqid();

	$master = new \ProcessWire\Field();
	$master->type = wire('modules')->get('FieldtypeTextarea');
	$master->name = $masterName;
	$master->set('inputfieldClass', 'InputfieldTiptap');
	$master->set('toolbar', 'bold italic | link');
	$master->set('headlines', ['h2', 'h3']);
	$master->set('height', 420);
	$master->set('miniBlocks', ['callout', 'pullquote']);
	$fields->save($master);

	$child = new \ProcessWire\Field();
	$child->type = wire('modules')->get('FieldtypeTextarea');
	$child->name = $childName;
	$child->set('inputfieldClass', 'InputfieldTiptap');
	// Simulate Field saving all InputfieldTiptap default config values alongside settingsField
	foreach (\ProcessWire\InputfieldTiptap::getDefaultConfig() as $k => $v) {
		$child->set($k, $v);
	}
	$child->set('settingsField', $masterName);
	$child->set('settingsJSON', json_encode(['add_miniBlocks' => ['details']]));
	$fields->save($child);

	try {
		$dummyPage = wire('pages')->get(1);
		/** @var \ProcessWire\InputfieldTiptap $inputfield */
		$inputfield = $child->getInputfield($dummyPage);
		$resolved = $inputfield->resolveEditorSettings();

		expect($resolved['toolbar'])->toBe('bold italic | link')
			->and($resolved['headlines'])->toBe(['h2', 'h3'])
			->and($resolved['height'])->toBe(420)
			->and($resolved['miniBlocks'])->toBe(['callout', 'pullquote', 'details']);
	} finally {
		if ($fields->get($childName)) {
			$fields->delete($child);
		}
		if ($fields->get($masterName)) {
			$fields->delete($master);
		}
	}
});

test('InputfieldTiptap enforces isEmpty(), Page-field data-maxlength, purifier fallback, nested mark tags, and reversed taskItem attributes', function (): void {
	/** @var \ProcessWire\InputfieldTiptap $editor */
	$editor = wire('modules')->get('InputfieldTiptap');
	$editor->attr('name', 'article_body');
	$editor->set('required', 1);
	$editor->set('maxlength', 10);
	$editor->set('miniBlocks', ['callout']);

	// 1. Page-field data-maxlength serialization & server maxlength enforcement
	$inertiaData = $editor->inertiaWithData();
	expect($inertiaData['maxLength'])->toBe(10);

	// 2. isEmpty() detects ProseMirror empty HTML wrappers
	$editor->attr('value', '<p><br></p>');
	expect($editor->isEmpty())->toBeTrue();
	$editor->attr('value', '<p>Valid</p>');
	expect($editor->isEmpty())->toBeFalse();

	// 3. Server processInput records error when plain-text length > maxlength
	$input = new \ProcessWire\WireInputData();
	$input->setArray([
		'article_body' => '<p><strong>12345678901</strong></p>', // 11 visible chars > 10
	]);
	$editor->processInput($input);
	expect($editor->getErrors())->not->toBeEmpty();

	// 4. Nested <span> inside <mark> and reversed data-checked/data-type taskItem survive HTMLPurifier
	$complexHtml = '<p><mark>Outer <span>inner</span> tail</mark></p><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><p>Done item</p></li></ul>';
	$cleanedComplex = $editor->cleanHtmlValue($complexHtml);
	expect($cleanedComplex)
		->toContain('<mark>Outer <span>inner</span> tail</mark>')
		->toContain('data-type="taskList"')
		->toContain('data-type="taskItem" data-checked="true"');

	// 5. Hardened DOM allowlist (when purifier disabled) strips id, arbitrary style, and mailto: on <img> while keeping safe text-align
	$domEditor = wire('modules')->get('InputfieldTiptap');
	$domEditor->set('features', ['toolbar']);
	$domCleaned = $domEditor->cleanHtmlValue('<p id="clobber" style="position:fixed;top:0" onclick="alert(1)">Important content <img src="mailto:test@example.com"></p><p style="text-align: center">Centered</p><script>evil()</script>');
	expect($domCleaned)
		->toContain('<p>Important content <img></p>')
		->toContain('<p style="text-align: center">Centered</p>')
		->not->toContain('clobber')
		->not->toContain('position:fixed')
		->not->toContain('onclick')
		->not->toContain('mailto:')
		->not->toContain('evil');
});

test('FormSchemaSerializer and ScalarFieldDataProvider handle InputfieldTiptap dynamic readOnly, aliases, and markup detection', function (): void {
	// 1. FormSchemaSerializer respects _weDynamicReadOnly on InputfieldTiptap
	/** @var \ProcessWire\InputfieldTiptap $tiptap */
	$tiptap = wire('modules')->get('InputfieldTiptap');
	$tiptap->attr('name', 'dynamic_prose');
	$tiptap->attr('disabled', 'disabled');
	$tiptap->attr('readonly', 'readonly');
	$tiptap->set('_weDynamicReadOnly', true);

	$wrapper = new \ProcessWire\InputfieldWrapper();
	wire($wrapper);
	$wrapper->add($tiptap);

	$serializer = new \Totoglu\React\Form\FormSchemaSerializer();
	wire($serializer);
	$schema = $serializer->serialize($wrapper);
	$serializedField = $schema['fields'][0] ?? [];
	expect($serializedField['type'] ?? null)->toBe('tiptap')
		->and($serializedField['disabled'] ?? null)->toBeFalse()
		->and($serializedField['readOnly'] ?? null)->toBeFalse();

	// 2. FormSchemaSerializer declarative aliases (`wysiwyg`, `html`) map to `tiptap`
	$declSchema = $serializer->serializeDefinitions([
		['name' => 'body_wysiwyg', 'type' => 'wysiwyg', 'label' => 'WYSIWYG'],
		['name' => 'raw_html_rich', 'type' => 'html', 'label' => 'HTML'],
	]);
	expect($declSchema['fields'][0]['type'] ?? null)->toBe('tiptap')
		->and($declSchema['fields'][1]['type'] ?? null)->toBe('tiptap');

	// 3. Inertia ScalarFieldDataProvider::isMarkupField recognizes InputfieldTiptap even when contentType === 0
	$mockField = new \ProcessWire\Field();
	$mockField->type = wire('modules')->get('FieldtypeTextarea');
	$mockField->set('inputfieldClass', 'InputfieldTiptap');
	$mockField->set('contentType', 0);
	expect(\Totoglu\Inertia\Provider\Field\ScalarFieldDataProvider::isMarkupField($mockField))->toBeTrue();
});

test('InputfieldTiptap enforces ProcessWire Languages::editable RBAC and avoids double purification on LanguageSupport re-entry', function (): void {
	$languages = wire('languages');
	if (!$languages || count($languages) < 2) {
		expect(true)->toBeTrue();
		return;
	}

	$secondaryLang = null;
	foreach ($languages as $lang) {
		if (!$lang->isDefault()) {
			$secondaryLang = $lang;
			break;
		}
	}
	expect($secondaryLang)->not->toBeNull();
	$secId = (int) $secondaryLang->id;

	$hookId = wire()->addHookAfter('InputfieldTiptap::isLanguageEditable', function (\ProcessWire\HookEvent $event) use ($secId): void {
		$lang = $event->arguments(0);
		if ($lang instanceof \ProcessWire\Language && (int) $lang->id === $secId) {
			$event->return = false;
		}
	});

	try {
		$purifyCount = 0;
		$editor = new class ($purifyCount) extends \ProcessWire\InputfieldTiptap {
			public function __construct(private int &$counter)
			{
				parent::__construct();
			}

			public function cleanHtmlValue(string $html): string
			{
				$this->counter++;
				return parent::cleanHtmlValue($html);
			}
		};
		wire($editor);
		$editor->init();
		$editor->attr('name', 'multilang_body');
		$editor->set('useLanguages', true);
		$editor->attr('value', '<p>Original EN</p>');
		$editor->set("value{$secId}", '<p>Original Secondary</p>');

		// 1. extractLanguageEntries reflects Languages::editable($lang) === false
		$entries = $editor->extractLanguageEntries();
		$secEntry = null;
		foreach ($entries as $entry) {
			if ($entry['id'] === $secId) {
				$secEntry = $entry;
			}
		}
		expect($secEntry)->not->toBeNull()
			->and($secEntry['editable'])->toBeFalse();

		// 2. processInput blocks writes to non-editable secondary language (both multi-lang pass and LanguageSupport renamed pass)
		$post = new \ProcessWire\WireInputData();
		$post->setArray([
			'multilang_body' => '<p>Updated EN</p>',
			"multilang_body__{$secId}" => '<p>Unauthorized overwrite</p>',
		]);
		$editor->processInput($post);
		expect($editor->attr('value'))->toBe('<p>Updated EN</p>')
			->and($editor->get("value{$secId}"))->toBe('<p>Original Secondary</p>')
			->and($purifyCount)->toBe(1);

		// Simulate LanguageSupport::hookInputfieldAfterProcessInput renaming field to multilang_body__{id}
		// First on blocked language: still rejected
		$editor->attr('name', "multilang_body__{$secId}");
		$editor->attr('value', '<p>Original Secondary</p>');
		$editor->processInput($post);
		expect($editor->attr('value'))->toBe('<p>Original Secondary</p>')
			->and($purifyCount)->toBe(1);
	} finally {
		wire()->removeHook($hookId);
	}

	// Now with secondary language editable, verify LanguageSupport second pass reuses cached sanitized HTML (zero double purification)
	$purifyCount2 = 0;
	$editor2 = new class ($purifyCount2) extends \ProcessWire\InputfieldTiptap {
		public function __construct(private int &$counter)
		{
			parent::__construct();
		}

		public function cleanHtmlValue(string $html): string
		{
			$this->counter++;
			return parent::cleanHtmlValue($html);
		}
	};
	wire($editor2);
	$editor2->init();
	$editor2->attr('name', 'multilang_body');
	$editor2->set('useLanguages', true);
	$post2 = new \ProcessWire\WireInputData();
	$post2->setArray([
		'multilang_body' => '<p>EN v2</p>',
		"multilang_body__{$secId}" => '<p>TR v2</p>',
	]);
	$editor2->processInput($post2);
	expect($purifyCount2)->toBe(2);

	// LanguageSupport re-invokes processInput for secondary language with renamed field
	$editor2->attr('name', "multilang_body__{$secId}");
	$editor2->attr('value', '');
	$editor2->processInput($post2);
	expect($editor2->attr('value'))->toBe('<p>TR v2</p>')
		->and($purifyCount2)->toBe(2);
});

test('MiniBlockHtmlSanitizer rejects malformed data-prop-* attribute names and strips unquoted data-tiptap-* attributes inside flat bodies', function (): void {
	$defs = [
		'callout' => [
			'name' => 'callout',
			'label' => 'Callout',
		],
		'badge_box' => [
			'name' => 'badge_box',
			'label' => 'Badge Box',
			'tag' => 'div',
			'editableBody' => false,
			'fields' => [
				[
					'name' => 'label',
					'attr' => 'data-prop-label',
					'type' => 'text',
				],
				[
					'name' => 'malicious',
					'attr' => 'data-prop-bad="" onload="alert(1)',
					'type' => 'text',
				],
			],
		],
	];

	$extracted = \Totoglu\React\Tiptap\MiniBlockHtmlSanitizer::extractAndSanitize(
		'<div data-tiptap-block="badge_box" data-prop-label="Trusted"></div>'
		. '<aside data-tiptap-block="callout" data-variant="info"><p data-tiptap-body data-tiptap-extra=unquoted>Safe copy</p></aside>',
		$defs,
		static fn(string $fragment): string => $fragment,
	);
	$restored = \Totoglu\React\Tiptap\MiniBlockHtmlSanitizer::restorePlaceholders(
		$extracted['html'],
		$extracted['replacements'],
	);

	expect($restored)
		->toContain('data-prop-label="Trusted"')
		->not->toContain('onload')
		->not->toContain('data-prop-bad')
		->not->toContain('data-tiptap-extra')
		->toContain('<aside data-tiptap-block="callout" data-variant="info"><p>Safe copy</p></aside>');
});
