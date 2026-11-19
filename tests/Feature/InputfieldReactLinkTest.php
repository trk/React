<?php // __(file-not-translatable)

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\Inertia\Provider\Field\ScalarFieldDataProvider;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Media\PageLinkMediaHostAdapter;

beforeEach(function (): void {
	$modules = wire()->modules;
	if (!$modules->isInstalled('React')) {
		$modules->install('React');
	}
	if (!$modules->isInstalled('InputfieldReactLink')) {
		$modules->install('InputfieldReactLink');
	}

	$this->createdPages = [];
	$this->createdTemplates = [];
	$this->createdFieldgroups = [];
	$this->createdFields = [];
});

afterEach(function (): void {
	$pages = wire()->pages;
	foreach (array_reverse($this->createdPages) as $p) {
		if ($p instanceof Page && $p->id > 0) {
			try {
				$pages->delete($p, true);
			} catch (\Throwable) {
			}
		}
	}

	$templates = wire()->templates;
	$classesDir = rtrim((string) wire()->config->paths->classes, '/') . '/';
	foreach (array_reverse($this->createdTemplates) as $tpl) {
		if ($tpl instanceof Template && $tpl->id > 0) {
			$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', $tpl->name)));
			try {
				$templates->delete($tpl);
			} catch (\Throwable) {
			}
			$fallbackClassFile = $classesDir . $pascal . 'Page.php';
			if (is_file($fallbackClassFile)) {
				@unlink($fallbackClassFile);
			}
		}
	}

	$fieldgroups = wire()->fieldgroups;
	foreach (array_reverse($this->createdFieldgroups) as $fg) {
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try {
				$fieldgroups->delete($fg);
			} catch (\Throwable) {
			}
		}
	}

	$fields = wire()->fields;
	foreach (array_reverse($this->createdFields) as $field) {
		if ($field instanceof Field && $field->id > 0) {
			try {
				$fields->delete($field);
			} catch (\Throwable) {
			}
		}
	}
});

test('InputfieldReactLink FieldtypeText config integration, multi-profile media parsing, and strict phone validation work cleanly', function (): void {
	$modules = wire()->modules;

	$linkIf = $modules->get('InputfieldReactLink');
	expect($linkIf)->toBeInstanceOf(InputfieldReactLink::class)
		->and(InputfieldReactLink::DEFAULT_TYPES)->toBe(['page', 'entry', 'url', 'tel', 'email', 'file'])
		->and(InputfieldReactLink::DEFAULT_TYPES)->not->toContain('anchor');

	// Verify FieldtypeText exposes InputfieldReactLink in inputfieldClass select
	$textField = new Field();
	$textField->type = $modules->get('FieldtypeText');
	$textField->name = 'tmp_link_cfg_text';
	$textConfig = $textField->type->getConfigInputfields($textField);
	/** @var InputfieldSelect|null $classSelect */
	$classSelect = $textConfig->getChildByName('inputfieldClass');
	expect($classSelect)->toBeInstanceOf(InputfieldSelect::class)
		->and($classSelect->getOptions())->toHaveKey('InputfieldReactLink');

	// Strict phone validation: only optional leading `+` and digits `0-9`
	expect(InputfieldReactLink::isValidPhoneInput('+905551234567'))->toBeTrue()
		->and(InputfieldReactLink::isValidPhoneInput('05551234567'))->toBeTrue()
		->and(InputfieldReactLink::isValidPhoneInput('+90 (555) 123-4567'))->toBeFalse()
		->and(InputfieldReactLink::isValidPhoneInput('+90-555-123'))->toBeFalse()
		->and(InputfieldReactLink::isValidPhoneInput('+'))->toBeFalse()
		->and(InputfieldReactLink::isValidPhoneInput('123+456'))->toBeFalse()
		->and(InputfieldReactLink::sanitizePhoneValue('tel:+90 (555) 123-4567'))->toBe('+905551234567');

	// Standalone `type: 'anchor'` & `#hash` fold cleanly into `type: 'url'`
	$foldedAnchor = InputfieldReactLink::normalizeValue(['type' => 'anchor', 'anchor' => 'pricing']);
	expect($foldedAnchor['type'])->toBe('url')
		->and($foldedAnchor['url'])->toBe('#pricing')
		->and($foldedAnchor['anchor'])->toBe('');

	$foldedHashStr = InputfieldReactLink::normalizeValue('#faq-section');
	expect($foldedHashStr['type'])->toBe('url')
		->and($foldedHashStr['url'])->toBe('#faq-section');

	// Multi-profile media parsing strips dangerous executable extensions and infers image/video/file kinds
	$profiles = InputfieldReactLink::normalizeMediaProfiles(
		"image: jpg png webp php\nvideo: mp4 webm phtml\nbrochure: pdf zip phar\ndemo_clip: mp4 mov",
		['page', 'url', 'image', 'video']
	);
	expect($profiles)->toHaveKeys(['image', 'video', 'brochure', 'demo_clip'])
		->and($profiles['image']['isImage'])->toBeTrue()
		->and($profiles['image']['extensions'])->toBe(['jpg', 'png', 'webp'])
		->and($profiles['video']['isVideo'])->toBeTrue()
		->and($profiles['video']['extensions'])->toBe(['mp4', 'webm'])
		->and($profiles['brochure']['kind'])->toBe('file')
		->and($profiles['brochure']['extensions'])->toBe(['pdf', 'zip'])
		->and($profiles['demo_clip']['isVideo'])->toBeTrue();

	// processInput rejects invalid phone formats, invalid emails, and disallowed target types
	$input = new InputfieldReactLink();
	wire($input);
	$input->attr('name', 'cta_link');
	$input->set('linkTypes', ['url', 'tel', 'email']);

	$rawBadTel = [
		'cta_link_present' => '1',
		'cta_link' => (string) json_encode(['type' => 'tel', 'url' => '+90 555 123']),
	];
	$postBadTel = new WireInputData($rawBadTel);
	$input->processInput($postBadTel);
	expect($input->getErrors())->not->toBeEmpty();

	$input->getErrors(true);
	$rawGoodTel = [
		'cta_link_present' => '1',
		'cta_link' => (string) json_encode(['type' => 'tel', 'url' => '+905551234567']),
	];
	$postGoodTel = new WireInputData($rawGoodTel);
	$input->processInput($postGoodTel);
	expect($input->getErrors())->toBeEmpty()
		->and($input->getNormalizedLink()['type'])->toBe('tel')
		->and($input->getNormalizedLink()['url'])->toBe('+905551234567');
});

test('Page lifecycle with InputfieldReactLink, PageLinkMediaHostAdapter file isolation, Inertia ScalarFieldDataProvider, and superseding cleanup works end-to-end', function (): void {
	$modules = wire()->modules;
	$fields = wire()->fields;
	$fieldgroups = wire()->fieldgroups;
	$templates = wire()->templates;
	$pages = wire()->pages;

	$fieldName = 'rw_test_page_link_' . substr(md5(uniqid('', true)), 0, 6);
	$linkField = new Field();
	$linkField->type = $modules->get('FieldtypeText');
	$linkField->name = $fieldName;
	$linkField->label = 'Hero Action Link';
	$linkField->set('inputfieldClass', 'InputfieldReactLink');
	$linkField->set('linkTypes', ['page', 'url', 'tel', 'email', 'file', 'image']);
	$linkField->set('mediaProfiles', "file: pdf txt\nimage: png jpg webp");
	$fields->save($linkField);
	$this->createdFields[] = $linkField;

	$tplName = 'rw_link_tpl_' . substr(md5(uniqid('', true)), 0, 6);
	$fg = new Fieldgroup();
	$fg->name = $tplName;
	$titleField = $fields->get('title');
	if ($titleField instanceof Field) {
		$fg->add($titleField);
	}
	$fg->add($linkField);
	$fieldgroups->save($fg);
	$this->createdFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $tplName;
	$tpl->fieldgroup = $fg;
	$templates->save($tpl);
	$this->createdTemplates[] = $tpl;

	$home = $pages->get(1);
	$page = $pages->new([
		'template' => $tpl,
		'parent' => $home,
		'name' => 'rw-link-page-' . uniqid(),
		'title' => 'Page Link Host',
	]);
	$pages->save($page);
	$this->createdPages[] = $page;

	// Verify Field::getInputfield resolves `InputfieldReactLink` and FormSchemaSerializer signs per-profile mediaTokens
	$resolvedInputfield = $linkField->getInputfield($page);
	expect($resolvedInputfield)->toBeInstanceOf(InputfieldReactLink::class);

	$serializer = new FormSchemaSerializer();
	wire($serializer);
	$serializedNode = $serializer->serializeInputfieldNode($resolvedInputfield);
	expect($serializedNode['type'])->toBe('link')
		->and($serializedNode['linkConfig']['types'])->toBe(['page', 'url', 'tel', 'email', 'file', 'image'])
		->and($serializedNode['linkConfig']['mediaProfiles'])->toHaveKeys(['file', 'image'])
		->and($serializedNode['linkConfig']['mediaProfiles']['file']['mediaToken'])->not->toBe('')
		->and($serializedNode['linkConfig']['mediaProfiles']['image']['mediaToken'])->not->toBe('');

	// Store two files (`old.txt` and `active.txt`) inside `links/{fieldName}/`, save Page pointing to `active.txt`, and verify `old.txt` is cleaned up!
	$linkDir = PageLinkMediaHostAdapter::directoryPathFor($page, $fieldName);
	wire()->files->mkdir($linkDir, true);
	file_put_contents($linkDir . 'old.txt', 'superseded');
	file_put_contents($linkDir . 'active.pdf', 'same-stem superseded');
	file_put_contents($linkDir . 'active.txt', 'current spec');

	$page->of(false);
	$page->set($fieldName, [
		'type' => 'file',
		'file' => 'active.txt',
		'label' => 'Download Spec',
	]);
	$pages->save($page);

	expect(is_file($linkDir . 'active.txt'))->toBeTrue()
		->and(is_file($linkDir . 'old.txt'))->toBeFalse()
		->and(is_file($linkDir . 'active.pdf'))->toBeFalse();

	// Formatted value resolves href, download flag, filesize, and Inertia ScalarFieldDataProvider emits structured link object
	$reloaded = $pages->get((int) $page->id);
	$reloaded->of(true);
	$formatted = $reloaded->get($fieldName);
	expect($formatted)->toBeArray()
		->and($formatted['type'])->toBe('file')
		->and($formatted['href'])->toContain('/links/' . $fieldName . '/active.txt')
		->and($formatted['isDownload'])->toBeTrue()
		->and($formatted['label'])->toBe('Download Spec');

	$inertiaProvider = new ScalarFieldDataProvider();
	wire($inertiaProvider);
	$inertiaTransformed = $inertiaProvider->transform($reloaded->getUnformatted($fieldName), $linkField, $reloaded);
	expect($inertiaTransformed)->toBeArray()
		->and($inertiaTransformed['href'])->toContain('/links/' . $fieldName . '/active.txt')
		->and($inertiaProvider->tsType($linkField))->toBe('Record<string, unknown> | null');

	// Switching Page link to `url` (`#features`) removes `links/{fieldName}/` directory automatically on save
	$reloaded->of(false);
	$reloaded->set($fieldName, [
		'type' => 'url',
		'url' => '#features',
		'label' => 'Jump to Features',
	]);
	$pages->save($reloaded);

	expect(is_dir($linkDir))->toBeFalse();
	$reloaded->of(true);
	expect($reloaded->get($fieldName)['href'])->toBe('#features');
});
