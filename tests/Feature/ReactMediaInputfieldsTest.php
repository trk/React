<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\InputfieldFile;
use ProcessWire\InputfieldImage;
use ProcessWire\InputfieldReactFile;
use ProcessWire\InputfieldReactImage;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Language;
use ProcessWire\Page;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\React;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireInputData;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Media\MediaGateway;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

/**
 * Create a solid-color or two-tone raster PNG test file on disk.
 */
function createRwTestPngFile(string $path, int $width = 640, int $height = 420, array $rgb = [24, 118, 210]): string
{
	$im = imagecreatetruecolor($width, $height);
	$primary = imagecolorallocate($im, $rgb[0], $rgb[1], $rgb[2]);
	$accent = imagecolorallocate($im, 240, 180, 41);
	imagefilledrectangle($im, 0, 0, $width - 1, $height - 1, $primary);
	imagefilledrectangle($im, (int) ($width * 0.25), (int) ($height * 0.25), (int) ($width * 0.75), (int) ($height * 0.75), $accent);
	imagepng($im, $path);
	unset($im);

	return $path;
}

/**
 * @param array<string, mixed> $post
 */
function makeRwMediaInputData(array $post): WireInputData
{
	$input = new WireInputData();
	$input->setArray($post);

	return $input;
}

beforeEach(function (): void {
	bootReactForTesting();
	$this->previousUser = wire('user');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superUser = wire('users')->get($superId);
	if ($superUser instanceof User && $superUser->id > 0) {
		$languages = wire('languages');
		if ($languages instanceof \ProcessWire\Languages) {
			$defaultLang = $languages->getDefault();
			if ($defaultLang instanceof Language) {
				$superUser->language = $defaultLang;
			}
		}
		wire('users')->setCurrentUser($superUser);
	}
	$this->cleanupPages = [];
	$this->cleanupTemplates = [];
	$this->cleanupFieldgroups = [];
	$this->cleanupFields = [];
	$this->cleanupTempDirs = [];
});

afterEach(function (): void {
	$workspace = React::instance();
	$workspace->set('useReactMediaFields', false);

	foreach (array_reverse($this->cleanupPages ?? []) as $page) {
		if ($page instanceof Page && $page->id > 0) {
			try {
				wire('pages')->delete($page, true);
			} catch (\Throwable) {
			}
		}
	}
	$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
	foreach (array_reverse($this->cleanupTemplates ?? []) as $tpl) {
		if ($tpl instanceof Template && $tpl->id > 0) {
			$tplName = (string) $tpl->name;
			$isSystem = (bool) ($tpl->flags & Template::flagSystem);
			$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', $tplName)));
			try {
				$tpl->flags = Template::flagSystemOverride;
				$tpl->flags = 0;
				wire('templates')->delete($tpl);
			} catch (\Throwable) {
			}
			if (!$isSystem) {
				$classFile = $classesDir . $pascal . 'Page.php';
				if (is_file($classFile)) {
					unlink($classFile);
				}
			}
		}
	}
	foreach (array_reverse($this->cleanupFieldgroups ?? []) as $fg) {
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try {
				wire('fieldgroups')->delete($fg);
			} catch (\Throwable) {
			}
		}
	}
	foreach (array_reverse($this->cleanupFields ?? []) as $field) {
		if ($field instanceof Field && $field->id > 0) {
			try {
				$field->flags = Field::flagSystemOverride;
				$field->flags = 0;
				wire('fields')->delete($field);
			} catch (\Throwable) {
			}
		}
	}
	foreach ($this->cleanupTempDirs ?? [] as $dir) {
		if (is_string($dir) && is_dir($dir)) {
			wire('files')->rmdir($dir, true);
		}
	}

	if (isset($this->previousUser) && $this->previousUser instanceof User && $this->previousUser->id > 0) {
		wire('users')->setCurrentUser($this->previousUser);
	}
});

test('InputfieldReactImage and InputfieldReactFile extend core Inputfields without custom Fieldtypes, filter FieldtypeFile config options, and support global useReactMediaFields upgrade without mutating Field schema', function (): void {
	$imgInput = new InputfieldReactImage();
	wire($imgInput);
	$fileInput = new InputfieldReactFile();
	wire($fileInput);

	expect($imgInput)->toBeInstanceOf(InputfieldImage::class)
		->and($imgInput)->toBeInstanceOf(InputfieldFile::class)
		->and($imgInput->inertiaComponent())->toBe('InputfieldReactImage')
		->and($fileInput)->toBeInstanceOf(InputfieldFile::class)
		->and($fileInput)->not->toBeInstanceOf(InputfieldImage::class)
		->and($fileInput->inertiaComponent())->toBe('InputfieldReactFile');

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$fields = wire('fields');

	$fileField = new Field();
	$fileField->type = wire('modules')->get('FieldtypeFile');
	$fileField->name = 'rw_test_file_' . $suffix;
	$fileField->set('extensions', 'pdf txt');
	$fields->save($fileField);
	$this->cleanupFields[] = $fileField;

	$imageField = new Field();
	$imageField->type = wire('modules')->get('FieldtypeImage');
	$imageField->name = 'rw_test_img_' . $suffix;
	$imageField->set('extensions', 'jpg jpeg png webp');
	$fields->save($imageField);
	$this->cleanupFields[] = $imageField;

	// Verify FieldtypeFile dropdown excludes InputfieldReactImage while FieldtypeImage includes it
	$fileConfig = $fileField->type->getConfigInputfields($fileField);
	$fileClassSelect = $fileConfig->getChildByName('inputfieldClass');
	if ($fileClassSelect instanceof InputfieldSelect) {
		$fileOpts = $fileClassSelect->getOptions();
		expect($fileOpts)->not->toHaveKey('InputfieldReactImage');
	}

	$home = wire('pages')->get(1);
	$workspace = React::instance();

	// With useReactMediaFields = false (default), standard InputfieldImage / InputfieldFile are returned
	$workspace->set('useReactMediaFields', false);
	expect($imageField->getInputfield($home))->toBeInstanceOf(InputfieldImage::class)
		->and($imageField->getInputfield($home))->not->toBeInstanceOf(InputfieldReactImage::class)
		->and($fileField->getInputfield($home))->toBeInstanceOf(InputfieldFile::class)
		->and($fileField->getInputfield($home))->not->toBeInstanceOf(InputfieldReactFile::class);

	// With useReactMediaFields = true, instances transparently upgrade WITHOUT mutating saved inputfieldClass
	$workspace->set('useReactMediaFields', true);
	$upgradedImg = $imageField->getInputfield($home);
	$upgradedFile = $fileField->getInputfield($home);

	expect($upgradedImg)->toBeInstanceOf(InputfieldReactImage::class)
		->and($upgradedFile)->toBeInstanceOf(InputfieldReactFile::class)
		->and((string) ($imageField->get('inputfieldClass') ?? ''))->toBe('')
		->and((string) ($fileField->get('inputfieldClass') ?? ''))->toBe('');
});

test('InputfieldReactImage renders Inertia island props, 260px admin thumbnails, and processes multi-language descriptions, tags, focal point + zoom, drag-and-drop sort, and deletion on a ProcessWire Page', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_media_page_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$imgField = new Field();
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_gallery_' . $suffix;
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	$imgField->set('extensions', 'jpg jpeg png webp');
	$imgField->set('maxFiles', 0);
	$imgField->set('useTags', 1);
	$imgField->set('tagsList', 'hero yacht featured');
	$imgField->set('descriptionRows', 2);
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_tpl_media_' . $suffix;
	$fg->add('title');
	$fg->add($imgField);
	wire('fieldgroups')->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	wire('templates')->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = wire('pages')->get(1);
	$page->name = 'rw-media-host-' . $suffix;
	$page->title = 'Media Host Page';
	$page->save();
	$this->cleanupPages[] = $page;

	$pngA = createRwTestPngFile($tmpDir . '/alpha-catamaran.png', 800, 500, [16, 120, 190]);
	$pngB = createRwTestPngFile($tmpDir . '/beta-marina.png', 720, 480, [30, 150, 95]);

	$page->of(false);
	/** @var Pageimages $images */
	$images = $page->getUnformatted($imgField->name);
	$images->add($pngA);
	$images->add($pngB);
	$page->save($imgField->name);

	$inputfield = $page->getInputfield($imgField->name);
	expect($inputfield)->toBeInstanceOf(InputfieldReactImage::class);

	$html = $inputfield->render();
	expect($html)->toContain('data-inertia-island="InputfieldReactImage"');

	$prop = $inputfield->toInertiaProp();
	expect($prop['component'])->toBe('InputfieldReactImage')
		->and($prop['props']['isImage'])->toBeTrue()
		->and($prop['props']['mediaEndpoint'])->toEndWith('/_react/media')
		->and($prop['props']['mediaToken'])->toBeString()->not->toBeEmpty()
		->and($prop['props']['tagsList'])->toContain('hero', 'yacht', 'featured')
		->and($prop['props']['files'])->toHaveCount(2);

	$fileA = $prop['props']['files'][0];
	$fileB = $prop['props']['files'][1];
	expect($fileA['width'])->toBe(800)
		->and($fileA['height'])->toBe(500)
		->and($fileA['thumbUrl'])->toContain('x260.');

	// Build POST payload mutating descriptions (all languages), tags, focal point + zoom, reversing sort order
	$post = [
		'sort_' . $fileA['id'] => '1',
		'sort_' . $fileB['id'] => '0',
		'description_' . $fileB['id'] => 'Sunset over Bodrum marina',
		'tags_' . $fileB['id'] => 'hero marina',
		'focus_' . $fileB['id'] => '28.5 71.2 15',
		'description_' . $fileA['id'] => 'Catamaran anchored in bay',
	];

	$nonDefaultLang = null;
	$languages = wire('languages');
	if ($languages && count($languages) > 1) {
		foreach ($languages as $lang) {
			if ($lang instanceof Language && !$lang->isDefault()) {
				$nonDefaultLang = $lang;
				break;
			}
		}
	}
	if ($nonDefaultLang instanceof Language) {
		$post['description' . $nonDefaultLang->id . '_' . $fileB['id']] = 'Secondary locale sunset over marina';
	}

	$inputfield->processInput(makeRwMediaInputData($post));
	$page->save($imgField->name);

	$reloaded = wire('pages')->get($page->id);
	$reloaded->of(false);
	/** @var Pageimages $savedImages */
	$savedImages = $reloaded->getUnformatted($imgField->name);
	expect($savedImages->count())->toBe(2);

	/** @var Pageimage $firstAfterSort */
	$firstAfterSort = $savedImages->first();
	expect($firstAfterSort->basename())->toBe($fileB['basename'])
		->and($firstAfterSort->description())->toBe('Sunset over Bodrum marina')
		->and($firstAfterSort->tags())->toContain('hero')
		->and($firstAfterSort->tags())->toContain('marina');

	$focusArr = $firstAfterSort->focus();
	expect(round((float) $focusArr['top'], 1))->toBe(28.5)
		->and(round((float) $focusArr['left'], 1))->toBe(71.2)
		->and((int) $focusArr['zoom'])->toBe(15);

	if ($nonDefaultLang instanceof Language) {
		expect($firstAfterSort->description($nonDefaultLang))->toBe('Secondary locale sunset over marina');
	}

	// Verify deletion via delete_{id}
	$inputfieldReloaded = $reloaded->getInputfield($imgField->name);
	$propReloaded = $inputfieldReloaded->toInertiaProp();
	$targetDeleteId = $propReloaded['props']['files'][1]['id'];
	$inputfieldReloaded->processInput(makeRwMediaInputData([
		'delete_' . $targetDeleteId => '1',
	]));
	$reloaded->save($imgField->name);

	expect($reloaded->getUnformatted($imgField->name)->count())->toBe(1);
});

test('MediaGateway enforces authentication, HMAC mediaToken user binding, HTTP method, readOnly lock, CSRF, and executes live upload, replace, crop/rotate/flip transforms, and color inspection on a Page', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_media_gw_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$imgField = new Field();
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_gw_img_' . $suffix;
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	$imgField->set('extensions', 'jpg jpeg png webp');
	$imgField->set('maxFiles', 3);
	$imgField->set('minWidth', 100);
	$imgField->set('minHeight', 100);
	$imgField->set('maxWidth', 600);
	$imgField->set('maxHeight', 600);
	$imgField->set('useTags', 1);
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_tpl_gw_' . $suffix;
	$fg->add('title');
	$fg->add($imgField);
	wire('fieldgroups')->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	wire('templates')->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = wire('pages')->get(1);
	$page->name = 'rw-gw-host-' . $suffix;
	$page->title = 'Gateway Host';
	$page->save();
	$this->cleanupPages[] = $page;

	$workspace = React::instance();
	$gateway = $workspace->media();
	expect($gateway)->toBeInstanceOf(MediaGateway::class);

	$inputfield = $page->getInputfield($imgField->name);
	$prop = $inputfield->toInertiaProp();
	$mediaToken = (string) $prop['props']['mediaToken'];

	// 1. Security checks: guest 403, missing token 400, tampered token 403, GET on upload 405, CSRF 419, readOnly 403
	$guest = wire('users')->getGuestUser();
	expect($gateway->handleAction(['action' => 'upload', 'mediaToken' => $mediaToken], false, $guest)['status'])->toBe(403)
		->and($gateway->handleAction(['action' => 'upload'], false, wire('user'))['status'])->toBe(400)
		->and($gateway->handleAction(['action' => 'upload', 'mediaToken' => $mediaToken . 'tampered'], false, wire('user'))['status'])->toBe(403)
		->and($gateway->handleAction(['action' => 'upload', 'mediaToken' => $mediaToken, '_requestMethod' => 'GET'], false, wire('user'))['status'])->toBe(405)
		->and($gateway->handleAction(['action' => 'upload', 'mediaToken' => $mediaToken, '_requestMethod' => 'POST'], true, wire('user'))['status'])->toBe(419);

	$readOnlyToken = $gateway->sign([
		'kind' => 'page',
		'isImage' => true,
		'pageId' => (int) $page->id,
		'fieldName' => $imgField->name,
		'inputName' => $imgField->name,
		'readOnly' => true,
	], (int) wire('user')->id);
	expect($gateway->handleAction(['action' => 'upload', 'mediaToken' => $readOnlyToken], false, wire('user'))['status'])->toBe(403);

	// 2. Reject image below minWidth/minHeight (60x60 < 100x100)
	$tinyPng = createRwTestPngFile($tmpDir . '/tiny.png', 60, 60);
	$tinyRes = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		[
			'files' => [
				'name' => ['tiny.png'],
				'type' => ['image/png'],
				'tmp_name' => [$tinyPng],
				'error' => [UPLOAD_ERR_OK],
				'size' => [filesize($tinyPng)],
			],
		],
	);
	expect($tinyRes['ok'])->toBeFalse()
		->and($tinyRes['status'])->toBe(422);

	// 3. Live AJAX upload of 900x600 image -> server-constrained to maxWidth=600 (600x400)
	$largePng = createRwTestPngFile($tmpDir . '/voyage-one.png', 900, 600, [20, 95, 185]);
	$uploadRes = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		[
			'files' => [
				'name' => ['voyage-one.png'],
				'type' => ['image/png'],
				'tmp_name' => [$largePng],
				'error' => [UPLOAD_ERR_OK],
				'size' => [filesize($largePng)],
			],
		],
	);
	expect($uploadRes['ok'])->toBeTrue()
		->and($uploadRes['status'])->toBe(200)
		->and($uploadRes['items'])->toHaveCount(1)
		->and($uploadRes['items'][0]['width'])->toBe(600)
		->and($uploadRes['items'][0]['height'])->toBe(400);

	$uploadedHash = (string) $uploadRes['items'][0]['hash'];
	$uploadedName = (string) $uploadRes['items'][0]['name'];

	// Seed rich metadata on the uploaded image before testing in-place Replace
	$page = wire('pages')->get($page->id);
	$page->of(false);
	/** @var Pageimage $storedImg */
	$storedImg = $page->getUnformatted($imgField->name)->first();
	$storedImg->isTemp(false);
	$storedImg->description = 'Original luxury deck';
	$storedImg->tags = 'deck featured';
	$storedImg->focus(30, 70, 12);
	$nonDefaultLang = null;
	foreach (wire('languages') ?: [] as $lang) {
		if ($lang instanceof Language && !$lang->isDefault()) {
			$nonDefaultLang = $lang;
			$storedImg->description($lang, 'Secondary locale luxury deck');
			break;
		}
	}
	$page->save($imgField->name);

	// 4. In-place Replace (`action=replace`) preserves descriptions (all langs), tags, and focus!
	$replacementPng = createRwTestPngFile($tmpDir . '/voyage-v2.png', 500, 300, [180, 50, 90]);
	$replaceRes = $gateway->handleAction(
		[
			'action' => 'replace',
			'mediaToken' => $mediaToken,
			'targetHash' => $uploadedHash,
			'targetName' => $uploadedName,
		],
		false,
		wire('user'),
		[
			'files' => [
				'name' => ['voyage-v2.png'],
				'type' => ['image/png'],
				'tmp_name' => [$replacementPng],
				'error' => [UPLOAD_ERR_OK],
				'size' => [filesize($replacementPng)],
			],
		],
	);

	expect($replaceRes['ok'])->toBeTrue()
		->and($replaceRes['item']['width'])->toBe(500)
		->and($replaceRes['item']['height'])->toBe(300)
		->and($replaceRes['item']['description'])->toBe('Original luxury deck')
		->and($replaceRes['item']['tags'])->toContain('deck')
		->and($replaceRes['item']['focus'])->toBe('30 70 12');

	if ($nonDefaultLang instanceof Language) {
		expect($replaceRes['item']['descriptions'][(string) $nonDefaultLang->id] ?? '')->toBe('Secondary locale luxury deck');
	}

	// 5. Studio Transform: Rotate +90° (500x300 -> 300x500) and Crop (200x220)
	$currentHash = (string) $replaceRes['item']['hash'];
	$currentName = (string) $replaceRes['item']['name'];

	$rotateRes = $gateway->handleAction(
		[
			'action' => 'transform',
			'operation' => 'rotate',
			'degrees' => 90,
			'mediaToken' => $mediaToken,
			'targetHash' => $currentHash,
			'targetName' => $currentName,
		],
		false,
		wire('user'),
	);
	expect($rotateRes['ok'])->toBeTrue()
		->and($rotateRes['item']['width'])->toBe(300)
		->and($rotateRes['item']['height'])->toBe(500);

	// Seed sidecar cache files and verify consecutive same-second Crop bumps ?nc= and purges stale sidecars
	$reloadedBeforeCrop = wire('pages')->get($page->id);
	$reloadedBeforeCrop->of(false);
	/** @var Pageimage $imgBeforeCrop */
	$imgBeforeCrop = $reloadedBeforeCrop->getUnformatted($imgField->name)->first();
	$sidecarLqip = $imgBeforeCrop->filename . '.lqip.webp';
	$sidecarColors = $imgBeforeCrop->filename . '.colors.json';
	file_put_contents($sidecarLqip, 'stale-lqip');
	file_put_contents($sidecarColors, '{"dominantColor":"#000000"}');

	$cropRes = $gateway->handleAction(
		[
			'action' => 'transform',
			'operation' => 'crop',
			'x' => 20,
			'y' => 30,
			'width' => 200,
			'height' => 220,
			'mediaToken' => $mediaToken,
			'targetHash' => (string) $rotateRes['item']['hash'],
			'targetName' => (string) $rotateRes['item']['name'],
		],
		false,
		wire('user'),
	);
	expect($cropRes['ok'])->toBeTrue()
		->and($cropRes['item']['width'])->toBe(200)
		->and($cropRes['item']['height'])->toBe(220)
		->and($cropRes['item']['url'])->not->toBe($rotateRes['item']['url'])
		->and(is_file($sidecarLqip))->toBeFalse()
		->and(is_file($sidecarColors))->toBeFalse();

	// 6. Inspect (`action=inspect`) returns visual metadata cleanly and enforces POST + CSRF
	expect($gateway->handleAction(['action' => 'inspect', 'mediaToken' => $mediaToken, '_requestMethod' => 'GET'], false, wire('user'))['status'])->toBe(405)
		->and($gateway->handleAction(['action' => 'inspect', 'mediaToken' => $mediaToken, '_requestMethod' => 'POST'], true, wire('user'))['status'])->toBe(419);

	$inspectRes = $gateway->handleAction(
		[
			'action' => 'inspect',
			'mediaToken' => $mediaToken,
			'targetHash' => (string) $cropRes['item']['hash'],
			'targetName' => (string) $cropRes['item']['name'],
		],
		false,
		wire('user'),
	);
	expect($inspectRes['ok'])->toBeTrue()
		->and($inspectRes['item'])->toBeArray();
	if (wire('modules')->isInstalled('InterventionImage')) {
		expect((string) ($inspectRes['item']['dominantColor'] ?? ''))->toStartWith('#')
			->and($inspectRes['item']['palette'])->toBeArray()->not->toBeEmpty();
	}
});

test('MediaGateway enforces maxFiles strictly on Page fields even when overwrite is enabled while preserving same-name overwrites', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_media_limit_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$imgField = new Field();
	wire($imgField);
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_limit_imgs_' . $suffix;
	$imgField->set('extensions', 'jpg jpeg png webp');
	$imgField->set('maxFiles', 2);
	$imgField->set('overwrite', 1);
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_limit_tpl_' . $suffix;
	$fg->add('title');
	$fg->add($imgField);
	wire('fieldgroups')->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	wire('templates')->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = wire('pages')->get(1);
	$page->name = 'rw-limit-page-' . $suffix;
	$page->title = 'Limit Enforcement Page';
	wire('pages')->save($page);
	$this->cleanupPages[] = $page;

	$workspace = React::instance();
	$gateway = $workspace->media();

	$inputfield = $imgField->getInputfield($page);
	expect($inputfield)->toBeInstanceOf(InputfieldReactImage::class);
	$inputfield->val($page->getUnformatted($imgField->name));

	$envelope = $gateway->buildEnvelopeFromInputfield($inputfield, true, $imgField->name, ['jpg', 'jpeg', 'png', 'webp'], false);
	expect($envelope)->not->toBeNull()
		->and($envelope['maxFiles'])->toBe(2)
		->and($envelope['overwrite'])->toBeTrue();

	$mediaToken = $gateway->sign($envelope, (int) wire('user')->id);

	$srcOne = createRwTestPngFile($tmpDir . '/alpha.png', 240, 180, [30, 100, 220]);
	$srcTwo = createRwTestPngFile($tmpDir . '/beta.png', 240, 180, [220, 90, 30]);
	$srcThree = createRwTestPngFile($tmpDir . '/gamma.png', 240, 180, [30, 180, 90]);
	$srcOneUpdated = createRwTestPngFile($tmpDir . '/alpha-updated.png', 400, 300, [150, 40, 200]);

	$res1 = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		['files' => ['name' => 'alpha.png', 'type' => 'image/png', 'tmp_name' => $srcOne, 'error' => UPLOAD_ERR_OK, 'size' => filesize($srcOne)]],
	);
	$res2 = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		['files' => ['name' => 'beta.png', 'type' => 'image/png', 'tmp_name' => $srcTwo, 'error' => UPLOAD_ERR_OK, 'size' => filesize($srcTwo)]],
	);
	$res3 = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		['files' => ['name' => 'gamma.png', 'type' => 'image/png', 'tmp_name' => $srcThree, 'error' => UPLOAD_ERR_OK, 'size' => filesize($srcThree)]],
	);

	expect($res1['ok'])->toBeTrue()
		->and($res2['ok'])->toBeTrue()
		->and($res2['files'])->toHaveCount(2)
		->and($res3['ok'])->toBeFalse()
		->and($res3['status'])->toBe(422)
		->and((string) $res3['error'])->toContain('Maximum file limit (2) reached.');

	// Overwriting existing `alpha.png` with the same basename succeeds without exceeding 2 or deleting `alpha.png` on save
	$resOverwrite = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		['files' => ['name' => 'alpha.png', 'type' => 'image/png', 'tmp_name' => $srcOneUpdated, 'error' => UPLOAD_ERR_OK, 'size' => filesize($srcOneUpdated)]],
	);
	expect($resOverwrite['ok'])->toBeTrue()
		->and($resOverwrite['files'])->toHaveCount(2);

	$reloaded = wire('pages')->get($page->id);
	$reloaded->of(false);
	/** @var Pageimages $afterImages */
	$afterImages = $reloaded->getUnformatted($imgField->name);
	/** @var Pageimage|null $alphaAfter */
	$alphaAfter = $afterImages->get('alpha.png');

	expect($afterImages->count())->toBe(2)
		->and($alphaAfter)->toBeInstanceOf(Pageimage::class)
		->and(is_file($alphaAfter->filename()))->toBeTrue()
		->and($alphaAfter->width())->toBe(400)
		->and($alphaAfter->height())->toBe(300);
});

test('MediaGateway blocks SVG by default on empty image extensions and rejects XSS payloads inside allowed SVG uploads while permitting clean vector SVGs', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_media_svg_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$imgField = new Field();
	wire($imgField);
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_svg_guard_' . $suffix;
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	$imgField->set('extensions', '');
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_svg_tpl_' . $suffix;
	$fg->add('title');
	$fg->add($imgField);
	wire('fieldgroups')->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	wire('templates')->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = wire('pages')->get(1);
	$page->name = 'rw-svg-page-' . $suffix;
	$page->title = 'SVG Security Page';
	wire('pages')->save($page);
	$this->cleanupPages[] = $page;

	$gateway = React::instance()->media();
	$inputfield = $page->getInputfield($imgField->name);
	$prop = $inputfield->toInertiaProp();

	// Empty extensions must NEVER implicitly allow svg
	expect($prop['props']['extensions'])->not->toContain('svg');

	$defaultToken = $gateway->sign([
		'kind' => 'page',
		'isImage' => true,
		'pageId' => (int) $page->id,
		'fieldName' => $imgField->name,
		'inputName' => $imgField->name,
		'extensions' => [],
	], (int) wire('user')->id);

	$cleanSvgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#0ea5e9"/></svg>';
	$cleanSvg = $tmpDir . '/clean-logo.svg';
	file_put_contents($cleanSvg, $cleanSvgContent);

	$blockedDefaultSvg = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $defaultToken],
		false,
		wire('user'),
		['files' => ['name' => 'clean-logo.svg', 'type' => 'image/svg+xml', 'tmp_name' => $cleanSvg, 'error' => UPLOAD_ERR_OK, 'size' => filesize($cleanSvg)]],
	);
	expect($blockedDefaultSvg['ok'])->toBeFalse()
		->and($blockedDefaultSvg['status'])->toBe(422);

	// Now explicitly allow svg on the field and test malicious SVG payloads vs clean SVG
	$imgField->set('extensions', 'jpg png svg');
	wire('fields')->save($imgField);

	$svgToken = (string) $page->getInputfield($imgField->name)->toInertiaProp()['props']['mediaToken'];

	$xssScriptSvg = $tmpDir . '/evil-script.svg';
	file_put_contents($xssScriptSvg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>');

	$xssEventSvg = $tmpDir . '/evil-onload.svg';
	file_put_contents($xssEventSvg, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"><rect width="10" height="10"/></svg>');

	$xssHrefSvg = $tmpDir . '/evil-href.svg';
	file_put_contents($xssHrefSvg, '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text y="15">Click</text></a></svg>');

	foreach ([$xssScriptSvg, $xssEventSvg, $xssHrefSvg] as $maliciousPath) {
		$res = $gateway->handleAction(
			['action' => 'upload', 'mediaToken' => $svgToken],
			false,
			wire('user'),
			['files' => ['name' => basename($maliciousPath), 'type' => 'image/svg+xml', 'tmp_name' => $maliciousPath, 'error' => UPLOAD_ERR_OK, 'size' => filesize($maliciousPath)]],
		);
		expect($res['ok'])->toBeFalse()
			->and($res['status'])->toBe(422);
	}

	// Re-create the temp upload file since WireUpload unlinks invalid ajax temp files during the rejected upload above
	file_put_contents($cleanSvg, $cleanSvgContent);

	$allowedCleanSvg = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $svgToken],
		false,
		wire('user'),
		['files' => ['name' => 'clean-logo.svg', 'type' => 'image/svg+xml', 'tmp_name' => $cleanSvg, 'error' => UPLOAD_ERR_OK, 'size' => filesize($cleanSvg)]],
	);
	expect($allowedCleanSvg['ok'])->toBeTrue()
		->and($allowedCleanSvg['items'])->toHaveCount(1)
		->and($allowedCleanSvg['items'][0]['ext'])->toBe('svg');
});

test('InputfieldReactImage and InputfieldReactFile enforce readOnly, disabled, noUpload, useImageEditor=0, maxReject, dimensionsByAspectRatio, useTags=8 predefined lock, and live policy tightening', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_media_policy_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$imgField = new Field();
	wire($imgField);
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_policy_img_' . $suffix;
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	$imgField->set('extensions', 'jpg jpeg png webp');
	$imgField->set('useImageEditor', 0);
	$imgField->set('maxWidth', 500);
	$imgField->set('maxHeight', 400);
	$imgField->set('minWidth', 400);
	$imgField->set('minHeight', 250);
	$imgField->set('maxReject', 1);
	$imgField->set('dimensionsByAspectRatio', 1);
	$imgField->set('useTags', 8); // Predefined tags ONLY
	$imgField->set('tagsList', 'approved certified');
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_policy_tpl_' . $suffix;
	$fg->add('title');
	$fg->add($imgField);
	wire('fieldgroups')->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	wire('templates')->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = wire('pages')->get(1);
	$page->name = 'rw-policy-page-' . $suffix;
	$page->title = 'Policy Page';
	wire('pages')->save($page);
	$this->cleanupPages[] = $page;

	$gateway = React::instance()->media();
	$inputfield = $page->getInputfield($imgField->name);
	$prop = $inputfield->toInertiaProp();

	expect($prop['props']['useImageEditor'])->toBeFalse()
		->and($prop['props']['maxReject'])->toBeTrue()
		->and($prop['props']['dimensionsByAspectRatio'])->toBeTrue()
		->and($prop['props']['tagsPredefinedOnly'])->toBeTrue();

	$mediaToken = (string) $prop['props']['mediaToken'];

	// 1. maxReject=1 rejects 700x500 image instead of auto-downscaling
	$oversized = createRwTestPngFile($tmpDir . '/oversized.png', 700, 500);
	$rejectRes = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		['files' => ['name' => 'oversized.png', 'type' => 'image/png', 'tmp_name' => $oversized, 'error' => UPLOAD_ERR_OK, 'size' => filesize($oversized)]],
	);
	expect($rejectRes['ok'])->toBeFalse()
		->and($rejectRes['status'])->toBe(422);

	// 2. dimensionsByAspectRatio=1 accepts a 300x450 portrait image against landscape min=400x250 / max=500x400!
	$portrait = createRwTestPngFile($tmpDir . '/portrait-ok.png', 300, 450);
	$portraitRes = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		['files' => ['name' => 'portrait-ok.png', 'type' => 'image/png', 'tmp_name' => $portrait, 'error' => UPLOAD_ERR_OK, 'size' => filesize($portrait)]],
	);
	expect($portraitRes['ok'])->toBeTrue()
		->and($portraitRes['items'][0]['width'])->toBe(300)
		->and($portraitRes['items'][0]['height'])->toBe(450);

	// 3. useImageEditor=0 blocks `action=transform` even for superuser!
	$uploadedItem = $portraitRes['items'][0];
	$transformBlocked = $gateway->handleAction(
		[
			'action' => 'transform',
			'operation' => 'rotate',
			'degrees' => 90,
			'mediaToken' => $mediaToken,
			'targetHash' => (string) $uploadedItem['hash'],
			'targetName' => (string) $uploadedItem['name'],
		],
		false,
		wire('user'),
	);
	expect($transformBlocked['ok'])->toBeFalse()
		->and($transformBlocked['status'])->toBe(403);

	// 4. useTags=8 strips unapproved freeform tags during processInput while keeping predefined tags
	$reloadedPage = wire('pages')->get($page->id);
	$reloadedPage->of(false);
	$reloadedInput = $reloadedPage->getInputfield($imgField->name);
	$itemId = (string) $reloadedInput->toInertiaProp()['props']['files'][0]['id'];
	$reloadedInput->processInput(makeRwMediaInputData([
		'tags_' . $itemId => 'approved unapproved_hack certified',
		'description_' . $itemId => 'Initial description',
	]));
	$reloadedPage->save($imgField->name);

	$savedImg = wire('pages')->get($page->id)->getUnformatted($imgField->name)->first();
	expect($savedImg->tags())->toContain('approved')
		->and($savedImg->tags())->toContain('certified')
		->and($savedImg->tags())->not->toContain('unapproved_hack');

	// 5. readOnly & disabled InputfieldReactImage ignores forged delete/description POST payloads
	$roPage = wire('pages')->get($page->id);
	$roPage->of(false);
	$roInput = $roPage->getInputfield($imgField->name);
	$roInput->set('readOnly', true);
	$roInput->processInput(makeRwMediaInputData([
		'delete_' . $itemId => '1',
		'description_' . $itemId => 'Tampered while readOnly',
	]));
	$roPage->save($imgField->name);

	$afterRo = wire('pages')->get($page->id)->getUnformatted($imgField->name);
	expect($afterRo->count())->toBe(1)
		->and($afterRo->first()->description())->toBe('Initial description');

	// 6. Live policy tightening: setting noUpload=1 on the field blocks upload even with a previously minted mediaToken!
	$imgField->set('noUpload', 1);
	wire('fields')->save($imgField);
	$smallValid = createRwTestPngFile($tmpDir . '/another.png', 420, 280);
	$blockedNoUpload = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $mediaToken],
		false,
		wire('user'),
		['files' => ['name' => 'another.png', 'type' => 'image/png', 'tmp_name' => $smallValid, 'error' => UPLOAD_ERR_OK, 'size' => filesize($smallValid)]],
	);
	expect($blockedNoUpload['ok'])->toBeFalse()
		->and($blockedNoUpload['status'])->toBe(403);
});

test('FormSchemaSerializer handles array extensions and tagsList, focusMode=false, table gridMode, declarative media definitions, and decompression bomb ceiling', function (): void {
	$serializer = React::instance()->forms();

	$imgInput = new InputfieldReactImage();
	wire($imgInput);
	$imgInput->attr('name', 'hero_media');
	$imgInput->set('extensions', ['jpg', 'webp']);
	$imgInput->set('tagsList', ['cover', 'editorial']);
	$imgInput->set('focusMode', false);
	$imgInput->set('gridMode', 'table');

	$serialized = $serializer->serializeMediaInputfield($imgInput, true);
	expect($serialized['extensions'])->toBe(['jpg', 'webp'])
		->and($serialized['tagsList'])->toBe(['cover', 'editorial'])
		->and($serialized['focusMode'])->toBe('off')
		->and($serialized['gridMode'])->toBe('table');

	$decl = $serializer->serializeDefinitions([
		[
			'name' => 'banner',
			'type' => 'image',
			'extensions' => ['png', 'webp'],
			'focusMode' => 'zoom',
			'minWidth' => 320,
			'maxWidth' => 1920,
			'maxReject' => true,
			'tagsList' => ['hero', 'featured'],
		],
	]);
	$bannerField = $decl['fields'][0];
	expect($bannerField['isImage'])->toBeTrue()
		->and($bannerField['isFile'])->toBeTrue()
		->and($bannerField['focusMode'])->toBe('zoom')
		->and($bannerField['minWidth'])->toBe(320)
		->and($bannerField['maxWidth'])->toBe(1920)
		->and($bannerField['maxReject'])->toBeTrue()
		->and($bannerField['tagsList'])->toBe(['hero', 'featured']);

	// Craft a minimal valid PNG header claiming 10000x10000 (100 MP > 64 MP decompression ceiling)
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_bomb_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$imgField = new Field();
	wire($imgField);
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_bomb_img_' . $suffix;
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	$imgField->set('extensions', 'png');
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_bomb_tpl_' . $suffix;
	$fg->add('title');
	$fg->add($imgField);
	wire('fieldgroups')->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	wire('templates')->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = wire('pages')->get(1);
	$page->name = 'rw-bomb-page-' . $suffix;
	$page->title = 'Bomb Guard Page';
	wire('pages')->save($page);
	$this->cleanupPages[] = $page;

	$ihdrData = pack('NNCCCCC', 10000, 10000, 8, 2, 0, 0, 0);
	$ihdrChunk = pack('N', 13) . 'IHDR' . $ihdrData . pack('N', crc32('IHDR' . $ihdrData));
	$iendChunk = pack('N', 0) . 'IEND' . pack('N', crc32('IEND'));
	$bombPng = $tmpDir . '/pixel-flood.png';
	file_put_contents($bombPng, "\x89PNG\r\n\x1a\n" . $ihdrChunk . $iendChunk);

	$gateway = React::instance()->media();
	$token = (string) $page->getInputfield($imgField->name)->toInertiaProp()['props']['mediaToken'];
	$bombRes = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $token],
		false,
		wire('user'),
		['files' => ['name' => 'pixel-flood.png', 'type' => 'image/png', 'tmp_name' => $bombPng, 'error' => UPLOAD_ERR_OK, 'size' => filesize($bombPng)]],
	);
	expect($bombRes['ok'])->toBeFalse()
		->and($bombRes['status'])->toBe(422);
});

test('MediaGateway enforces field-level RBAC without unscoped editable bypass and serializes custom fileSchema fields on empty and populated items', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_rep_rbac_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$captionField = new Field();
	wire($captionField);
	$captionField->type = wire('modules')->get('FieldtypeText');
	$captionField->name = 'rw_credit_' . $suffix;
	wire('fields')->save($captionField);
	$this->cleanupFields[] = $captionField;

	$imgField = new Field();
	wire($imgField);
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_rep_img_' . $suffix;
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	$imgField->set('extensions', 'jpg png');
	// Enable field-level access control: editor role CANNOT edit `$imgField`
	$imgField->flags = Field::flagAccess | Field::flagAccessEditor;
	$imgField->editRoles = [];
	$imgField->viewRoles = [];
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	// Create custom per-file field template `field-{fieldName}`
	$fileSchemaFg = new Fieldgroup();
	$fileSchemaFg->name = 'field-' . $imgField->name;
	$fileSchemaFg->add($captionField);
	wire('fieldgroups')->save($fileSchemaFg);
	$this->cleanupFieldgroups[] = $fileSchemaFg;

	$fileSchemaTpl = new Template();
	$fileSchemaTpl->name = 'field-' . $imgField->name;
	$fileSchemaTpl->fieldgroup = $fileSchemaFg;
	$fileSchemaTpl->flags = Template::flagSystem;
	wire('templates')->save($fileSchemaTpl);
	$this->cleanupTemplates[] = $fileSchemaTpl;

	$hostFg = new Fieldgroup();
	$hostFg->name = 'rw_rep_host_tpl_' . $suffix;
	$hostFg->add('title');
	$hostFg->add($imgField);
	wire('fieldgroups')->save($hostFg);
	$this->cleanupFieldgroups[] = $hostFg;

	$editorRole = null;
	$editorUser = null;

	try {
		$editorRole = wire('roles')->add('rw-rep-editor-' . $suffix);
		$editorRole->addPermission('page-view');
		$editorRole->addPermission('page-edit');
		wire('roles')->save($editorRole);

		$editorUser = wire('users')->add('rw-rep-user-' . $suffix);
		$editorUser->pass = 'Str0ngPass!' . $suffix;
		$editorUser->addRole($editorRole);
		wire('users')->save($editorUser);

		$hostTpl = new Template();
		$hostTpl->name = $hostFg->name;
		$hostTpl->fieldgroup = $hostFg;
		$hostTpl->useRoles = 1;
		$guestRoleId = (int) wire('roles')->get('guest')->id;
		$hostTpl->set('roles', [$guestRoleId, (int) $editorRole->id]);
		$hostTpl->set('editRoles', [(int) $editorRole->id]);
		wire('templates')->save($hostTpl);
		$this->cleanupTemplates[] = $hostTpl;

		$hostPage = new Page();
		$hostPage->template = $hostTpl;
		$hostPage->parent = wire('pages')->get(1);
		$hostPage->name = 'rw-rep-host-' . $suffix;
		$hostPage->title = 'Field RBAC Host';
		wire('pages')->save($hostPage);
		$this->cleanupPages[] = $hostPage;

		// Empty state must report hasCustomFields = true when `field-{fieldName}` template exists!
		$emptyInputfield = $hostPage->getInputfield($imgField->name);
		$emptyInputfield->set('gridRatio', '16:9');
		$emptyInputfield->set('minFiles', 2);
		$emptyProp = $emptyInputfield->toInertiaProp();
		expect($emptyProp['props']['hasCustomFields'])->toBeTrue()
			->and($emptyProp['props']['gridRatio'])->toBe('16:9')
			->and($emptyProp['props']['minFiles'])->toBe(2);

		// Verify server-side minFiles enforcement when fewer than 2 images are present
		$emptyInputfield->processInput(makeRwMediaInputData([]));
		expect($emptyInputfield->getErrors())->not->toBeEmpty();

		// Seed one image as superuser and verify custom field serialization works outside WirePageEditor
		$seedPng = createRwTestPngFile($tmpDir . '/seeded.png', 320, 240);
		$hostPage->of(false);
		$hostPage->getUnformatted($imgField->name)->add($seedPng);
		$hostPage->save($imgField->name);

		$populatedProp = $hostPage->getInputfield($imgField->name)->toInertiaProp();
		expect($populatedProp['props']['files'])->toHaveCount(1)
			->and($populatedProp['props']['files'][0]['customFields'])->not->toBeEmpty();

		// Switch to restricted editor user who CAN edit `$hostPage` (`$hostPage->editable() === true`),
		// but CANNOT edit `$imgField` due to field-level `editRoles = []`!
		wire('users')->setCurrentUser($editorUser);
		expect($hostPage->editable())->toBeTrue()
			->and($hostPage->editable($imgField->name))->toBeFalse();

		$gateway = React::instance()->media();
		$forgedToken = $gateway->sign([
			'kind' => 'page',
			'isImage' => true,
			'pageId' => (int) $hostPage->id,
			'rootPageId' => (int) $hostPage->id,
			'fieldName' => $imgField->name,
			'inputName' => $imgField->name,
		], (int) $editorUser->id);

		$deniedRes = $gateway->handleAction(
			['action' => 'upload', 'mediaToken' => $forgedToken],
			false,
			$editorUser,
			['files' => ['name' => 'seeded.png', 'type' => 'image/png', 'tmp_name' => $seedPng, 'error' => UPLOAD_ERR_OK, 'size' => filesize($seedPng)]],
		);
		expect($deniedRes['ok'])->toBeFalse()
			->and($deniedRes['status'])->toBe(403);

		// Also verify non-superuser without `page-edit-images` receives useImageEditor=false when permission exists
		if (wire('permissions')->has('page-edit-images') && !$editorUser->hasPermission('page-edit-images', $hostPage)) {
			$superUser = wire('users')->get((int) (wire('config')->superUserPageID ?: 41));
			wire('users')->setCurrentUser($superUser);
			$imgField->editRoles = [(int) $editorRole->id];
			$imgField->viewRoles = [(int) $editorRole->id];
			wire('fields')->save($imgField);

			wire('users')->setCurrentUser($editorUser);
			$editorProp = $hostPage->getInputfield($imgField->name)->toInertiaProp();
			expect($editorProp['props']['useImageEditor'])->toBeFalse();
		}
	} finally {
		$superUser = wire('users')->get((int) (wire('config')->superUserPageID ?: 41));
		if ($superUser instanceof User && $superUser->id > 0) {
			try {
				wire('users')->setCurrentUser($superUser);
			} catch (\Throwable) {
			}
		}
		if ($editorUser instanceof User && $editorUser->id > 0) {
			try {
				wire('users')->delete($editorUser);
			} catch (\Throwable) {
			}
		}
		if ($editorRole instanceof \ProcessWire\Role && $editorRole->id > 0) {
			try {
				wire('roles')->delete($editorRole);
			} catch (\Throwable) {
			}
		}
	}
});

test('FormSchemaSerializer preserves populated media filename arrays in top-level values even when useLanguages is active', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_media_values_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupTempDirs[] = $tmpDir;

	$seedPng = createRwTestPngFile($tmpDir . '/fleet-hero.png', 320, 200);

	$imgField = new Field();
	wire($imgField);
	$imgField->type = wire('modules')->get('FieldtypeImage');
	$imgField->name = 'rw_val_img_' . $suffix;
	$imgField->set('extensions', 'jpg jpeg png webp');
	$imgField->set('maxFiles', 1);
	$imgField->set('descriptionRows', 1);
	$imgField->set('inputfieldClass', 'InputfieldReactImage');
	wire('fields')->save($imgField);
	$this->cleanupFields[] = $imgField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_val_tpl_' . $suffix;
	$fg->add('title');
	$fg->add($imgField);
	wire('fieldgroups')->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	wire('templates')->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = wire('pages')->get(1);
	$page->name = 'rw-val-page-' . $suffix;
	$page->title = 'Media Values Preservation';
	wire('pages')->save($page);
	$this->cleanupPages[] = $page;

	$page->of(false);
	$page->getUnformatted($imgField->name)->add($seedPng);
	$page->save($imgField->name);

	$reloaded = wire('pages')->get($page->id);
	$reloaded->of(false);
	$imgInputfield = $imgField->getInputfield($reloaded);
	expect($imgInputfield)->toBeInstanceOf(InputfieldReactImage::class);
	$imgInputfield->val($reloaded->getUnformatted($imgField->name));

	$wrapper = new InputfieldWrapper();
	wire($wrapper);
	$wrapper->add($imgInputfield);

	$hoverInputfield = new InputfieldSelect();
	wire($hoverInputfield);
	$hoverInputfield->name = 'rw_val_fit_' . $suffix;
	$hoverInputfield->label = 'Media Fit';
	$hoverInputfield->enableIf = "{$imgField->name}!=0|";
	$hoverInputfield->addOption('cover', 'Cover');
	$wrapper->add($hoverInputfield);

	$serializer = new FormSchemaSerializer();
	wire($serializer);
	$schema = $serializer->serialize($wrapper);

	expect($schema['values'][$imgField->name] ?? null)->toBeArray()
		->and($schema['values'][$imgField->name])->toBe(['fleet-hero.png'])
		->and($schema['fields'][0]['value'] ?? null)->toBe(['fleet-hero.png']);

	$declFromFiles = $serializer->serializeDefinitions([
		[
			'name' => 'hero_image',
			'type' => 'image',
			'label' => 'Hero Image',
			'useLanguages' => true,
			'files' => [
				['name' => 'modified-fleet-01.jpg'],
			],
		],
		[
			'name' => 'hover_image',
			'type' => 'image',
			'label' => 'Hover Image',
			'useLanguages' => true,
			'enableIf' => 'hero_image!=0|',
			'value' => [],
		],
	]);

	expect($declFromFiles['values']['hero_image'] ?? null)->toBe(['modified-fleet-01.jpg'])
		->and($declFromFiles['values']['hover_image'] ?? null)->toBe([]);
});

test('MediaGateway preserves untouched gallery variations & restores partial overwrite failures, maxFiles=1 rollback, centered transform rollback, and detached PageLink guard', function (): void {
	/** @var React $react */
	$react = wire('react');
	$modules = wire('modules');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$pages = wire('pages');
	$users = wire('users');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = $users->get($superId);

	$suffix = bin2hex(random_bytes(4));
	$tmpDir = sys_get_temp_dir() . '/rw-media-rollback-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$galleryField = null;
	$singleField = null;
	$detachedLinkField = null;
	$tpl = null;
	$fg = null;
	$page = null;

	try {
		$galleryField = new Field();
		$galleryField->type = $modules->get('FieldtypeImage');
		$galleryField->name = 'rw_gal_rb_' . $suffix;
		$galleryField->extensions = 'png jpg';
		$galleryField->maxFiles = 0;
		$galleryField->overwrite = 1;
		$galleryField->maxWidth = 300;
		$galleryField->maxReject = 1;
		$fields->save($galleryField);
		$this->cleanupFields[] = $galleryField;

		$singleField = new Field();
		$singleField->type = $modules->get('FieldtypeImage');
		$singleField->name = 'rw_sgl_rb_' . $suffix;
		$singleField->extensions = 'png jpg';
		$singleField->maxFiles = 1;
		$singleField->overwrite = 1;
		$singleField->maxWidth = 300;
		$singleField->maxReject = 1;
		$fields->save($singleField);
		$this->cleanupFields[] = $singleField;

		$detachedLinkField = new Field();
		$detachedLinkField->type = $modules->get('FieldtypeText');
		$detachedLinkField->name = 'rw_det_link_' . $suffix;
		$detachedLinkField->inputfieldClass = 'InputfieldReactLink';
		$fields->save($detachedLinkField);
		$this->cleanupFields[] = $detachedLinkField;

		$fg = new Fieldgroup();
		$fg->name = 'rw_media_rb_tpl_' . $suffix;
		$fg->add($fields->get('title'));
		$fg->add($galleryField);
		$fg->add($singleField);
		$fieldgroups->save($fg);
		$this->cleanupFieldgroups[] = $fg;

		$tpl = new Template();
		$tpl->name = 'rw_media_rb_tpl_' . $suffix;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);
		$this->cleanupTemplates[] = $tpl;

		$page = new Page();
		$page->template = $tpl;
		$page->parent = $pages->get(1);
		$page->name = 'rw-media-rb-' . $suffix;
		$page->title = 'Media Rollback Test';
		$pages->save($page);
		$this->cleanupPages[] = $page;

		$untouchedSrc = createRwTestPngFile($tmpDir . '/untouched.png', 160, 120, [10, 80, 160]);
		$targetSrc = createRwTestPngFile($tmpDir . '/target.png', 140, 100, [40, 140, 80]);
		$singleSrc = createRwTestPngFile($tmpDir . '/single-orig.png', 120, 90, [90, 60, 180]);

		$page->of(false);
		$galCollection = $page->getUnformatted($galleryField->name);
		$galCollection->add($untouchedSrc);
		$galCollection->add($targetSrc);
		$untouchedItem = $galCollection->get('untouched.png');
		$targetItem = $galCollection->get('target.png');
		$targetItem->description = 'Original Target Description';
		$sglCollection = $page->getUnformatted($singleField->name);
		$sglCollection->add($singleSrc);
		$pages->save($page);

		// Create a variation file on disk for untouched.png to prove it is never stripped when target.png is overwritten/rolled back
		$pages->uncacheAll();
		$page = $pages->get((int) $page->id);
		$page->of(false);
		$untouchedItem = $page->getUnformatted($galleryField->name)->get('untouched.png');
		expect($untouchedItem)->toBeInstanceOf(Pageimage::class);
		$variationPath = rtrim((string) $page->filesManager()->path(), '/\\') . '/untouched.80x60.png';
		createRwTestPngFile($variationPath, 80, 60, [10, 80, 160]);
		expect(is_file($variationPath))->toBeTrue();

		// 1. Partial multi-file overwrite=true failure: target.png passes runValidatedUpload then fails ImageSizer::resize
		// inside executeUpload() loop while added-ok.png succeeds and untouched.png variations stay intact
		$wideTargetPath = createRwTestPngFile($tmpDir . '/target-wide.png', 280, 100, [200, 30, 30]);
		$okNewPath = createRwTestPngFile($tmpDir . '/added-ok.png', 100, 100, [30, 200, 30]);
		$galInput = $galleryField->getInputfield($page);
		$galEnv = $react->media()->buildEnvelopeFromInputfield($galInput, true, $galleryField->name, ['png', 'jpg'], false);
		expect($galEnv)->toBeArray();
		$galInput->set('maxWidth', 250);
		$galInput->set('maxReject', 0);
		$galEnv['maxWidth'] = 250;
		$galEnv['maxReject'] = false;
		$galEnv['overwrite'] = true;

		$refExecUpload = new \ReflectionMethod(MediaGateway::class, 'executeUpload');
		$resizeThrowHook = wire('pages')->addHookBefore('ImageSizer::resize', static function (\ProcessWire\HookEvent $event): void {
			$sizer = $event->object;
			if ($sizer instanceof \ProcessWire\ImageSizer) {
				$bn = basename((string) $sizer->getFilename());
				if ($bn === 'target.png' || $bn === 'replacement-diff.png') {
					throw new \ProcessWire\WireException('Simulated resize failure for ' . $bn);
				}
			}
		});
		try {
			$partialRes = $refExecUpload->invoke(
				$react->media(),
				['kind' => 'page', 'page' => $page, 'fieldName' => $galleryField->name, 'adapter' => null],
				$galEnv,
				$page->getUnformatted($galleryField->name),
				$galInput,
				$galleryField->name,
				true,
				[
					'files' => [
						'name' => ['target.png', 'added-ok.png'],
						'tmp_name' => [$wideTargetPath, $okNewPath],
						'type' => ['image/png', 'image/png'],
						'error' => [0, 0],
						'size' => [filesize($wideTargetPath), filesize($okNewPath)],
					],
				]
			);

			$pages->uncacheAll();
			$reloadedGalPage = $pages->get((int) $page->id);
			$reloadedGalPage->of(false);
			$afterGal = $reloadedGalPage->getUnformatted($galleryField->name);
			$restoredTarget = $afterGal->get('target.png');

			expect($partialRes['ok'] ?? false)->toBeTrue()
				->and($afterGal->get('added-ok.png'))->toBeInstanceOf(Pageimage::class)
				->and($restoredTarget)->toBeInstanceOf(Pageimage::class)
				->and($restoredTarget->width())->toBe(140)
				->and((string) $restoredTarget->description)->toBe('Original Target Description')
				->and(is_file($variationPath))->toBeTrue();

			// 2. maxFiles=1 rollback preserves pre-existing file on disk when new filename differs and fails post-staging
			$newSinglePath = createRwTestPngFile($tmpDir . '/replacement-diff.png', 200, 100, [180, 90, 20]);
			$sglInput = $singleField->getInputfield($reloadedGalPage);
			$sglInput->set('maxWidth', 150);
			$sglInput->set('maxReject', 0);
			$sglEnv = [
				'kind' => 'page',
				'pageId' => (int) $reloadedGalPage->id,
				'fieldName' => $singleField->name,
				'maxFiles' => 1,
				'overwrite' => true,
				'isImage' => true,
				'maxWidth' => 150,
				'maxReject' => false,
			];
			$sglFailRes = $refExecUpload->invoke(
				$react->media(),
				['kind' => 'page', 'page' => $reloadedGalPage, 'fieldName' => $singleField->name, 'adapter' => null],
				$sglEnv,
				$reloadedGalPage->getUnformatted($singleField->name),
				$sglInput,
				$singleField->name,
				true,
				[
					'files' => [
						'name' => 'replacement-diff.png',
						'tmp_name' => $newSinglePath,
						'type' => 'image/png',
						'error' => 0,
						'size' => filesize($newSinglePath),
					],
				]
			);

			$pages->uncacheAll();
			$afterSglPage = $pages->get((int) $page->id);
			$afterSglPage->of(false);
			$afterSglCol = $afterSglPage->getUnformatted($singleField->name);
			$restoredSgl = $afterSglCol->get('single-orig.png');
			expect($sglFailRes['ok'] ?? true)->toBeFalse()
				->and($afterSglCol->count())->toBe(1)
				->and($restoredSgl)->toBeInstanceOf(Pageimage::class)
				->and(is_file((string) $restoredSgl->filename()))->toBeTrue();
		} finally {
			wire('pages')->removeHook($resizeThrowHook);
		}

		// 3. executeTransform() rollback restores centered '50 50 0' focus and original bytes/mtime on failure
		$sglFilename = (string) $restoredSgl->filename();
		$origBytes = (string) file_get_contents($sglFilename);
		$origMtime = (int) filemtime($sglFilename);
		$restoredSgl->focus('50 50 0');
		$afterSglPage->save($singleField->name);

		$targetPageId = (int) $afterSglPage->id;
		$saveThrowHook = wire('pages')->addHookBefore('saveField', static function (\ProcessWire\HookEvent $event) use ($targetPageId): void {
			$savedPage = $event->arguments(0);
			if ($savedPage instanceof Page && (int) $savedPage->id === $targetPageId) {
				throw new \RuntimeException('Simulated transform persist failure');
			}
		});
		try {
			$xfmRes = (new \ReflectionMethod(MediaGateway::class, 'executeTransform'))->invoke(
				$react->media(),
				['kind' => 'page', 'page' => $afterSglPage, 'rootPage' => $afterSglPage, 'fieldName' => $singleField->name, 'adapter' => null],
				['useImageEditor' => true, 'maxFiles' => 1],
				[
					'targetName' => 'single-orig.png',
					'operation' => 'rotate',
					'degrees' => 90,
				],
				$afterSglPage->getUnformatted($singleField->name),
				$sglInput,
				$singleField->name,
				true,
				$superUser,
			);
			clearstatcache(true, $sglFilename);
			expect($xfmRes['ok'] ?? true)->toBeFalse()
				->and((string) file_get_contents($sglFilename))->toBe($origBytes)
				->and($restoredSgl->focus()['str'] ?? '')->toBe('50 50 0')
				->and((int) filemtime($sglFilename))->toBe($origMtime);
		} finally {
			wire('pages')->removeHook($saveThrowHook);
		}

		// 4. PageLinkMediaHostAdapter::resolveTargetContext() rejects field not attached to ownerPage template
		$adapter = new \Totoglu\React\Media\PageLinkMediaHostAdapter();
		wire($adapter);
		$detachedCtx = $adapter->resolveTargetContext([
			'pageId' => (int) $page->id,
			'fieldName' => $detachedLinkField->name,
		], $superUser, false);
		expect($detachedCtx['ok'] ?? true)->toBeFalse()
			->and($detachedCtx['status'] ?? 0)->toBe(404);
	} finally {
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			@rmdir($tmpDir);
		}
	}
});
