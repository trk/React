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

	$this->prevUser = wire()->user;
	$su = wire()->users->get((int) (wire()->config->superUserPageID ?: 41));
	if ($su instanceof User && $su->id > 0) {
		wire()->users->setCurrentUser($su);
	}

	$this->createdPages = [];
	$this->createdTemplates = [];
	$this->createdFieldgroups = [];
	$this->createdFields = [];
});

afterEach(function (): void {
	if (($this->prevUser ?? null) instanceof User && $this->prevUser->id > 0) {
		wire()->users->setCurrentUser($this->prevUser);
	}
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
		->and(InputfieldReactLink::DEFAULT_TYPES)->toBe(['page', 'url', 'tel', 'email', 'file'])
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

test('InputfieldReactLink enforces 6 granular feature flags, ariaLabel storage, and FormSchemaSerializer linkConfig', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$fieldName = 'rw_link_flags_' . $suffix;

	$field = new Field();
	$field->type = wire()->modules->get('FieldtypeText');
	$field->name = $fieldName;
	$field->label = 'CTA Link';
	$field->set('inputfieldClass', 'InputfieldReactLink');
	$field->set('enableLabel', 0);
	$field->set('enableAriaLabel', 1);
	$field->set('enableTarget', 1);
	$field->set('enableRel', 0);
	$field->set('enableAnchor', 1);
	$field->set('enableQuery', '');
	wire()->fields->save($field);
	$this->createdFields[] = $field;

	$flags = InputfieldReactLink::normalizeFeatureFlags($field->getArray());
	expect($flags)->toBe([
		'enableLabel' => false,
		'enableAriaLabel' => true,
		'enableTarget' => true,
		'enableRel' => false,
		'enableAnchor' => true,
		'enableQuery' => false,
	]);

	$fg = new Fieldgroup();
	$fg->name = 'rw_link_flags_tpl_' . $suffix;
	$fg->add(wire()->fields->get('title'));
	$fg->add($field);
	wire()->fieldgroups->save($fg);
	$this->createdFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = 'rw_link_flags_tpl_' . $suffix;
	$tpl->fieldgroup = $fg;
	wire()->templates->save($tpl);
	$this->createdTemplates[] = $tpl;

	$page = wire()->pages->new([
		'template' => $tpl,
		'parent' => wire()->pages->get(1),
		'title' => 'Link Flags ' . $suffix,
	]);
	$this->createdPages[] = $page;

	// Serialize Inputfield through FormSchemaSerializer and verify canonical 6 flags (zero enableTitle / enableAttributes) + languages
	$form = new InputfieldWrapper();
	wire($form);
	$inputfield = $field->getInputfield($page);
	expect($inputfield)->toBeInstanceOf(InputfieldReactLink::class);
	$form->add($inputfield);

	$serializer = new FormSchemaSerializer();
	wire($serializer);
	$schema = $serializer->serialize($form);
	$serializedLink = $schema['fields'][0] ?? null;
	$trLang = wire()->languages?->get('tr');
	expect($serializedLink)->toBeArray()
		->and($serializedLink['linkConfig'])->toHaveKeys([
			'enableLabel',
			'enableAriaLabel',
			'enableTarget',
			'enableRel',
			'enableAnchor',
			'enableQuery',
		])
		->and($serializedLink['linkConfig'])->not->toHaveKey('enableTitle')
		->and($serializedLink['linkConfig'])->not->toHaveKey('enableAttributes')
		->and($serializedLink['linkConfig']['enableLabel'])->toBeFalse()
		->and($serializedLink['linkConfig']['enableAriaLabel'])->toBeTrue()
		->and($serializedLink['linkConfig']['enableTarget'])->toBeTrue()
		->and($serializedLink['linkConfig']['enableRel'])->toBeFalse()
		->and($serializedLink['linkConfig']['enableAnchor'])->toBeTrue()
		->and($serializedLink['linkConfig']['enableQuery'])->toBeFalse();

	if ($trLang instanceof Language && $trLang->id > 0) {
		expect(count($serializedLink['linkConfig']['languages'] ?? []))->toBeGreaterThanOrEqual(2);
	}

	// Submit disabled properties through processInput -> disabled flags strip label + labels & retain localized ariaLabels
	$trLangKey = ($trLang instanceof Language && $trLang->id > 0) ? (string) $trLang->id : '1025';
	$rawPayload = json_encode([
		'type' => 'url',
		'url' => 'https://example.com/docs',
		'label' => 'Should Be Stripped',
		'labels' => ['default' => 'Should Be Stripped', $trLangKey => 'Soyulmalı'],
		'ariaLabel' => 'Open documentation in new tab',
		'ariaLabels' => ['default' => 'Open documentation in new tab', $trLangKey => 'Belgeleri yeni sekmede aç'],
		'target' => '_blank',
		'rel' => 'sponsored',
		'anchor' => '#install',
		'query' => '?utm_source=test',
	], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

	$inputArr = [$fieldName => $rawPayload];
	$input = new WireInputData($inputArr);
	$inputfield->processInput($input);
	$savedNorm = InputfieldReactLink::normalizeValue($inputfield->val());
	expect($savedNorm['label'])->toBe('')
		->and(array_key_exists('labels', $savedNorm))->toBeFalse()
		->and($savedNorm['ariaLabel'])->toBe('Open documentation in new tab')
		->and($savedNorm['ariaLabels'][$trLangKey] ?? null)->toBe('Belgeleri yeni sekmede aç')
		->and($savedNorm['target'])->toBe('_blank')
		->and($savedNorm['rel'])->toBe('')
		->and($savedNorm['anchor'])->toBe('install')
		->and($savedNorm['query'])->toBe('');

	// Resolve with owner Page + Field applies the same flag guards & formats localized ariaLabel safely
	$page->of(false);
	$page->set($fieldName, $rawPayload);
	wire()->pages->save($page);
	$resolved = InputfieldReactLink::resolveValue($page->getUnformatted($fieldName), $page, $field);
	expect($resolved['customLabel'])->toBe('')
		->and($resolved['label'])->toBe('https://example.com/docs#install')
		->and($resolved['ariaLabel'])->toBe('Open documentation in new tab')
		->and(array_key_exists('title', $resolved))->toBeFalse()
		->and($resolved['target'])->toBe('_blank')
		->and($resolved['rel'])->toBe('noopener noreferrer')
		->and($resolved['href'])->toBe('https://example.com/docs#install');

	if ($trLang instanceof Language && $trLang->id > 0) {
		$resolvedTr = InputfieldReactLink::resolveValue($page->getUnformatted($fieldName), $page, $field, $trLang);
		expect($resolvedTr['ariaLabel'])->toBe('Belgeleri yeni sekmede aç')
			->and($resolvedTr['customLabel'])->toBe('');
	}
});

test('InputfieldReactLink uses canonical resourceType/resourceId via React::registerLinkResolver() and preserves prior valid value on error', function (): void {
	/** @var React $react */
	$react = wire('react');
	$react->registerLinkResolver('entry', static function (array $value): ?array {
		$resType = (string) ($value['resourceType'] ?? '');
		$resId = (string) ($value['resourceId'] ?? '');
		if ($resType === 'catalog' && $resId === '42') {
			return [
				'href' => '/catalog/42/',
				'label' => 'Catalog Item 42',
			];
		}

		return null;
	});

	try {
		$resolved = InputfieldReactLink::resolveValue([
			'type' => 'entry',
			'resourceType' => 'catalog',
			'resourceId' => '42',
		]);
		expect($resolved['type'])->toBe('entry')
			->and($resolved['resourceType'])->toBe('catalog')
			->and($resolved['resourceId'])->toBe('42')
			->and($resolved['href'])->toBe('/catalog/42/')
			->and($resolved['label'])->toBe('Catalog Item 42');
	} finally {
		$react->registerLinkResolver('entry', null);
	}

	/** @var InputfieldReactLink $inputfield */
	$inputfield = wire('modules')->get('InputfieldReactLink');
	$inputfield->attr('name', 'preserve_test_link');
	$validInitial = json_encode(['type' => 'url', 'url' => 'https://processwire.com', 'label' => 'PW']);
	$inputfield->attr('value', $validInitial);

	$inputfield->getErrors(true);
	$linkPost = [
		'preserve_test_link' => json_encode(['type' => 'tel', 'url' => 'not-a-phone-number!!']),
	];
	$inputfield->___processInput(new WireInputData($linkPost));
	expect($inputfield->getErrors())->not->toBe([])
		->and(InputfieldReactLink::normalizeValue($inputfield->val())['url'])->toBe('https://processwire.com');
});

test('InputfieldReactLink enforces Languages::editable(), forwards typeLabels, resolves custom media style assets, retains resolver types, and omits guest tokens', function (): void {
	/** @var React $react */
	$react = wire()->react;
	$modules = wire()->modules;
	$users = wire()->users;
	$prevUser = wire()->user;

	// 1. buildRawLinkConfig() forwards non-empty typeLabels and getModuleStyleAssets() checks normalizeMediaProfiles()
	/** @var InputfieldReactLink $cfgLink */
	$cfgLink = $modules->get('InputfieldReactLink');
	$cfgLink->set('linkTypes', ['url', 'custom_doc']);
	$cfgLink->set('mediaProfiles', ['custom_doc' => ['label' => 'Document', 'extensions' => 'pdf']]);
	$cfgLink->set('typeLabels', ['url' => 'Web Link', 'custom_doc' => 'Spec Sheet']);

	$builtCfg = $cfgLink->buildRawLinkConfig();
	expect($builtCfg['typeLabels'] ?? null)->toBe(['url' => 'Web Link', 'custom_doc' => 'Spec Sheet'])
		->and($cfgLink->getModuleStyleAssets())->not->toBe([]);

	/** @var InputfieldReactLink $noMediaLink */
	$noMediaLink = $modules->get('InputfieldReactLink');
	$noMediaLink->set('linkTypes', ['url', 'email']);
	$noMediaLink->set('mediaProfiles', false);
	expect($noMediaLink->getModuleStyleAssets())->toBe([]);

	// 2. FormSchemaSerializer retains custom resolver-only types and emits empty relationToken/mediaToken for guests
	$suffix = bin2hex(random_bytes(3));
	$resolverType = 'catalog_' . $suffix;
	$react->registerLinkResolver($resolverType, static fn(array $val): ?array => [
		'href' => '/catalog/' . ($val['resourceId'] ?? '1'),
		'label' => 'Catalog Item',
	]);

	try {
		$guest = $users->getGuestUser();
		$users->setCurrentUser($guest);

		/** @var InputfieldReactLink $resolverLink */
		$resolverLink = $modules->get('InputfieldReactLink');
		$resolverLink->attr('name', 'custom_resolver_link');
		$resolverLink->set('linkTypes', ['page', 'url', 'file', $resolverType]);
		$resolverLink->set('defaultType', 'url');

		$serializer = new FormSchemaSerializer();
		wire()->wire($serializer);
		$node = $serializer->serializeInputfieldNode($resolverLink);
		expect($node['linkConfig']['types'] ?? [])->toContain($resolverType)
			->and($node['linkConfig']['relationTokens']['page'] ?? null)->toBe('')
			->and($node['linkConfig']['mediaProfiles']['file']['mediaToken'] ?? null)->toBe('');

		/** @var InputfieldReactM2O $relInput */
		$relInput = $modules->get('InputfieldReactM2O');
		$relInput->attr('name', 'guest_rel');
		$relInput->set('resource', 'page');
		$relData = $relInput->inertiaWithData();
		expect($relData['relationToken'] ?? null)->toBe('');
	} finally {
		$react->registerLinkResolver($resolverType, null);
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}

	// 3. InputfieldReactLink::___processInput() preserves previous values for languages where Languages::editable() is false
	$realLangs = wire()->languages;
	if ($realLangs instanceof Languages && $realLangs->count() > 0) {
		$defaultLang = $realLangs->getDefault();
		$secondaryLang = null;
		foreach ($realLangs as $candidateLang) {
			if ($candidateLang instanceof Language && !$candidateLang->isDefault()) {
				$secondaryLang = $candidateLang;
				break;
			}
		}

		$stubConfig = new Config();
		$stubWire = new class($stubConfig) extends ProcessWire {
			public function __construct(Config $cfg)
			{
				$this->fuel = new Fuel();
				$this->fuel->set('config', $cfg);
				$this->fuel->set('hooks', new WireHooks($this, $cfg));
			}
		};
		$stubFuel = $stubWire->fuel();
		$stubFuel->set('sanitizer', wire()->sanitizer);
		$stubFuel->set('user', $users->getGuestUser());

		$stubLangs = new class($stubWire, $defaultLang, $secondaryLang) extends Languages {
			/** @var array<int, bool> */
			public array $editableById = [];
			/** @var list<Language> */
			private array $langList = [];

			public function __construct(ProcessWire $w, ?Language $def, ?Language $sec)
			{
				$this->setWire($w);
				if ($def instanceof Language) {
					$this->langList[] = $def;
				}
				if ($sec instanceof Language) {
					$this->langList[] = $sec;
				}
			}

			public function getIterator(): \Traversable
			{
				return new \ArrayIterator($this->langList);
			}

			public function editable($language): bool
			{
				if ($language instanceof Language) {
					return $this->editableById[(int) $language->id] ?? true;
				}

				return true;
			}
		};
		$stubFuel->set('languages', $stubLangs);

		/** @var InputfieldReactLink $langLink */
		$langLink = $modules->get('InputfieldReactLink');
		$langLink->setWire($stubWire);
		$langLink->set('hasPage', wire()->pages->get(1));
		$langLink->attr('name', 'lang_guard_link');
		$langLink->set('linkTypes', ['url', 'image']);

		$secIdKey = $secondaryLang instanceof Language ? (string) $secondaryLang->id : '1020';
		$secNameKey = $secondaryLang instanceof Language ? (string) $secondaryLang->name : 'tr';

		// Case A: default language is NOT editable, secondary language IS editable
		$stubLangs->editableById = [
			(int) $defaultLang->id => false,
		];
		if ($secondaryLang instanceof Language) {
			$stubLangs->editableById[(int) $secondaryLang->id] = true;
		}

		$langLink->attr('value', [
			'type' => 'image',
			'url' => '/site/assets/files/1/hero.png',
			'file' => 'hero.png',
			'label' => 'Locked Default Label',
			'ariaLabel' => 'Locked Default Aria',
			'alt' => 'Locked Default Alt',
			'labels' => ['default' => 'Locked Default Label', $secIdKey => 'Old Sec Label'],
			'ariaLabels' => ['default' => 'Locked Default Aria', $secIdKey => 'Old Sec Aria'],
			'descriptions' => ['default' => 'Locked Default Alt', $secIdKey => 'Old Sec Alt'],
		]);

		$postCaseA = [
			'lang_guard_link' => json_encode([
				'type' => 'image',
				'url' => '/site/assets/files/1/hero.png',
				'file' => 'hero.png',
				'label' => 'Tampered Default Label',
				'ariaLabel' => 'Tampered Default Aria',
				'alt' => 'Tampered Default Alt',
				'labels' => ['default' => 'Tampered Default Label', $secIdKey => 'Updated Sec Label'],
				'ariaLabels' => ['default' => 'Tampered Default Aria', $secIdKey => 'Updated Sec Aria'],
				'descriptions' => ['default' => 'Tampered Default Alt', $secIdKey => 'Updated Sec Alt'],
			]),
		];
		$langLink->___processInput(new WireInputData($postCaseA));

		$afterCaseA = $langLink->getNormalizedLink();
		expect($afterCaseA['label'])->toBe('Locked Default Label')
			->and($afterCaseA['ariaLabel'])->toBe('Locked Default Aria')
			->and($afterCaseA['alt'] ?? null)->toBe('Locked Default Alt')
			->and($afterCaseA['labels']['default'] ?? null)->toBe('Locked Default Label')
			->and($afterCaseA['descriptions']['default'] ?? null)->toBe('Locked Default Alt');
		if ($secondaryLang instanceof Language) {
			expect($afterCaseA['labels'][$secIdKey] ?? null)->toBe('Updated Sec Label')
				->and($afterCaseA['descriptions'][$secIdKey] ?? null)->toBe('Updated Sec Alt');
		}

		// Case B: secondary language is NOT editable -> keeps previous and drops newly added keys for that language
		if ($secondaryLang instanceof Language) {
			$stubLangs->editableById[(int) $defaultLang->id] = true;
			$stubLangs->editableById[(int) $secondaryLang->id] = false;

			$langLink->attr('value', [
				'type' => 'image',
				'url' => '/site/assets/files/1/hero.png',
				'file' => 'hero.png',
				'label' => 'Def Label',
				'labels' => ['default' => 'Def Label', $secIdKey => 'Preserved Sec Label'],
				'descriptions' => ['default' => 'Def Alt'],
			]);

			$postCaseB = [
				'lang_guard_link' => json_encode([
					'type' => 'image',
					'url' => '/site/assets/files/1/hero.png',
					'file' => 'hero.png',
					'label' => 'New Def Label',
					'labels' => ['default' => 'New Def Label', $secIdKey => 'Tampered Sec', $secNameKey => 'Injected Name Key'],
					'ariaLabels' => [$secIdKey => 'Injected Aria'],
					'descriptions' => ['default' => 'New Def Alt', $secIdKey => 'Injected Desc'],
				]),
			];
			$langLink->___processInput(new WireInputData($postCaseB));

			$afterCaseB = $langLink->getNormalizedLink();
			expect($afterCaseB['label'])->toBe('New Def Label')
				->and($afterCaseB['labels'][$secIdKey] ?? null)->toBe('Preserved Sec Label')
				->and($afterCaseB['labels'])->not->toHaveKey($secNameKey)
				->and($afterCaseB)->not->toHaveKey('ariaLabels')
				->and($afterCaseB['descriptions'] ?? [])->not->toHaveKey($secIdKey);
		}
	}
});
