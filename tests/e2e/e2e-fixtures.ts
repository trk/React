import { runWirePhp } from '../../../../../tests/e2e/helpers';

export interface IsolatedE2EFixture {
	suffix: string;
	validPngBase64: string;
	csrf: { name: string; value: string };
	hostPageId: number;
	inlineSummaryPageId: number;
	summaryFieldName: string;
	viewportRecordsPageIds: number[];
	viewportProps: Record<string, unknown>;
	mediaSchemaFormProps: Record<string, unknown>;
	imageFieldName: string;
	fileFieldName: string;
	linkSchemaFormProps: Record<string, unknown>;
	linkFieldName: string;
	iconSchemaFormProps: Record<string, unknown>;
	iconFieldName: string;
	iconFieldId: number;
	relationSchemaFormProps: Record<string, unknown>;
	tiptapSlashSchemaFormProps: Record<string, unknown>;
}

export function provisionIsolatedE2EFixture(): IsolatedE2EFixture {
	return runWirePhp<IsolatedE2EFixture>(`
		require_once 'site/modules/React/tests/bootstrap.php';

		$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
		$modules = $wire->modules;
		$fields = $wire->fields;
		$fieldgroups = $wire->fieldgroups;
		$templates = $wire->templates;
		$pages = $wire->pages;

		// 1. Create isolated fields
		$imgField = new \\ProcessWire\\Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = 'rw_e2e_pw_img_' . $suffix;
		$imgField->label = 'Gallery Images';
		$imgField->set('inputfieldClass', 'InputfieldReactImage');
		$imgField->set('extensions', 'png jpg jpeg webp');
		$imgField->set('maxFiles', 2);
		$imgField->set('useTags', 1);
		$imgField->set('useImageEditor', 1);
		$fields->save($imgField);

		$fileField = new \\ProcessWire\\Field();
		$fileField->type = $modules->get('FieldtypeFile');
		$fileField->name = 'rw_e2e_pw_file_' . $suffix;
		$fileField->label = 'Spec Documents';
		$fileField->set('inputfieldClass', 'InputfieldReactFile');
		$fileField->set('extensions', 'txt pdf');
		$fileField->set('maxFiles', 2);
		$fields->save($fileField);

		$linkField = new \\ProcessWire\\Field();
		$linkField->type = $modules->get('FieldtypeText');
		$linkField->name = 'rw_e2e_pw_link_' . $suffix;
		$linkField->label = 'Primary CTA Link';
		$linkField->set('inputfieldClass', 'InputfieldReactLink');
		$linkField->set('linkTypes', ['page', 'url', 'email', 'tel', 'image']);
		$linkField->set('mediaProfiles', "image: png jpg webp");
		$fields->save($linkField);

		$iconField = new \\ProcessWire\\Field();
		$iconField->type = $modules->get('FieldtypeText');
		$iconField->name = 'rw_e2e_pw_icon_' . $suffix;
		$iconField->label = 'Feature Highlight Icon';
		$iconField->set('inputfieldClass', 'InputfieldReactIcon');
		$iconField->set('allowCustomization', 1);
		$fields->save($iconField);

		$inlineField = new \\ProcessWire\\Field();
		$inlineField->type = $modules->get('FieldtypeTextarea');
		$inlineField->name = 'rw_e2e_pw_inline_' . $suffix;
		$inlineField->label = 'Inline Summary';
		$inlineField->set('inputfieldClass', 'InputfieldTiptap');
		$inlineField->set('inlineMode', 1);
		$inlineField->set('bubbleToolbar', 'bold italic underline | link removeformat');
		$inlineField->collapsed = \\ProcessWire\\Inputfield::collapsedYes;
		$fields->save($inlineField);

		$parentRefField = new \\ProcessWire\\Field();
		$parentRefField->type = $modules->get('FieldtypePage');
		$parentRefField->name = 'rw_e2e_pw_owner_' . $suffix;
		$parentRefField->label = 'Owner Host';
		$parentRefField->set('derefAsPage', \\ProcessWire\\FieldtypePage::derefAsPageOrNullPage);
		$fields->save($parentRefField);

		// 2. Create isolated template & fieldgroup
		$fg = new \\ProcessWire\\Fieldgroup();
		$fg->name = 'rw_e2e_pw_tpl_' . $suffix;
		$fg->add($fields->get('title'));
		$fg->add($imgField);
		$fg->add($fileField);
		$fg->add($linkField);
		$fg->add($iconField);
		$fg->add($inlineField);
		$fg->add($parentRefField);
		$fieldgroups->save($fg);

		$tpl = new \\ProcessWire\\Template();
		$tpl->name = $fg->name;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		// 3. Create isolated test pages under Home (id=1)
		$home = $pages->get(1);
		$hostPage = new \\ProcessWire\\Page();
		$hostPage->template = $tpl;
		$hostPage->parent = $home;
		$hostPage->name = 'rw-e2e-pw-host-' . $suffix;
		$hostPage->title = 'E2E Workspace Host';
		$hostPage->set($inlineField->name, '<p>Chromeless live ProcessPageEdit summary</p>');
		$pages->save($hostPage);

		$itemIds = [];
		foreach ([
			['slug' => 'alpha', 'title' => 'Alpha Vessel'],
			['slug' => 'beta', 'title' => 'Beta Cruiser'],
			['slug' => 'gamma', 'title' => 'Gamma Explorer'],
		] as $spec) {
			$item = new \\ProcessWire\\Page();
			$item->template = $tpl;
			$item->parent = $hostPage;
			$item->name = 'rw-e2e-pw-' . $spec['slug'] . '-' . $suffix;
			$item->title = $spec['title'];
			if ($spec['slug'] === 'alpha') {
				$item->set($parentRefField->name, $hostPage);
			}
			$pages->save($item);
			$itemIds[] = (int) $item->id;
		}

		$react = \\ProcessWire\\React::instance();
		$serializer = new \\Totoglu\\React\\Form\\FormSchemaSerializer();
		$wire->wire($serializer);

		// 4. Build live MarkupReactTable viewport props backed by PagesDataProvider
		/** @var \\ProcessWire\\MarkupReactTable $table */
		$table = $react->viewport('table');
		$table->configure('pages:template=' . $tpl->name . ', parent=' . (int) $hostPage->id . ', sort=name', [
			'componentId' => 'e2e_live_pages_vp_' . $suffix,
			'title' => 'Fleet Vessels',
			'allowedViewModes' => ['table', 'cards'],
			'inlineEditableFields' => [
				'title' => ['label' => 'Title', 'type' => 'text'],
			],
			'quickEditEnabled' => true,
			'exportEnabled' => true,
			'selectable' => true,
			'views' => [
				'all' => ['label' => 'All Vessels', 'icon' => 'layers'],
			],
		]);
		$viewportProp = $table->toInertiaProp();

		// 5. Serialize Media SchemaForm props (Image + File)
		$imgInputfield = $hostPage->getInputfield($imgField->name);
		$fileInputfield = $hostPage->getInputfield($fileField->name);
		$mediaForm = $modules->get('InputfieldForm');
		$mediaForm->attr('id+name', 'e2e_media_form');
		$mediaForm->add($imgInputfield);
		$mediaForm->add($fileInputfield);
		$mediaSchemaFormProps = $serializer->serialize($mediaForm, ['dirtyGuard' => false]);

		// 6. Serialize Link SchemaForm props
		$linkInputfield = $linkField->getInputfield($hostPage);
		$linkForm = $modules->get('InputfieldForm');
		$linkForm->attr('id+name', 'e2e_link_form');
		$linkForm->add($linkInputfield);
		$linkSchemaFormProps = $serializer->serialize($linkForm, ['dirtyGuard' => false]);

		// 7. Serialize Relation SchemaForm props (M2O, M2M, O2M, M2A)
		$relForm = $modules->get('InputfieldForm');
		$relForm->attr('id+name', 'e2e_relation_form');

		/** @var \\ProcessWire\\InputfieldReactM2O $m2o */
		$m2o = new \\ProcessWire\\InputfieldReactM2O();
		$wire->wire($m2o);
		$m2o->init();
		$m2o->attr('id+name', 'rel_m2o_vessel');
		$m2o->label = 'Primary Vessel (M2O)';
		$m2o->set('resource', 'page');
		$m2o->set('parentId', (int) $hostPage->id);
		$m2o->set('templates', [$tpl->name]);
		$m2o->set('widget', 'autocomplete');
		$relForm->add($m2o);

		/** @var \\ProcessWire\\InputfieldReactM2M $m2m */
		$m2m = new \\ProcessWire\\InputfieldReactM2M();
		$wire->wire($m2m);
		$m2m->init();
		$m2m->attr('id+name', 'rel_m2m_vessels');
		$m2m->label = 'Featured Vessels (M2M)';
		$m2m->set('resource', 'page');
		$m2m->set('parentId', (int) $hostPage->id);
		$m2m->set('templates', [$tpl->name]);
		$m2m->set('sortable', true);
		$m2m->val([$itemIds[0], $itemIds[1]]);
		$relForm->add($m2m);

		/** @var \\ProcessWire\\InputfieldReactO2M $o2m */
		$o2m = new \\ProcessWire\\InputfieldReactO2M();
		$wire->wire($o2m);
		$o2m->init();
		$o2m->attr('id+name', 'rel_o2m_children');
		$o2m->label = 'Assigned Fleet (O2M)';
		$o2m->set('resource', 'page');
		$o2m->set('ownerId', (int) $hostPage->id);
		$o2m->set('foreignField', $parentRefField->name);
		$o2m->set('parentId', (int) $hostPage->id);
		$o2m->set('templates', [$tpl->name]);
		$o2m->set('allowUnlink', true);
		$o2m->set('allowQuickCreate', true);
		$relForm->add($o2m);

		/** @var \\ProcessWire\\InputfieldReactM2A $m2a */
		$m2a = new \\ProcessWire\\InputfieldReactM2A();
		$wire->wire($m2a);
		$m2a->init();
		$m2a->attr('id+name', 'rel_m2a_refs');
		$m2a->label = 'Polymorphic References (M2A)';
		$m2a->set('allowedResources', ['page', 'template']);
		$relForm->add($m2a);

		$relationSchemaFormProps = $serializer->serialize($relForm, ['dirtyGuard' => false]);

		// 8. Serialize Tiptap SlashMenu + MiniBlocks + ProcessWire pwlink/pwimage SchemaForm props
		/** @var \\ProcessWire\\InputfieldTiptap $slashTiptap */
		$slashTiptap = new \\ProcessWire\\InputfieldTiptap();
		$wire->wire($slashTiptap);
		$slashTiptap->init();
		$slashTiptap->attr('id+name', 'editorial_story');
		$slashTiptap->label = 'Editorial Story';
		$slashTiptap->hasPage = $hostPage;
		$slashTiptap->hasField = $inlineField;
		$slashTiptap->set('toolbar', 'styles | bold italic | link unlink anchor image | source');
		$slashTiptap->set('slashMenu', 1);
		$slashTiptap->set('miniBlocks', ['callout', 'cta', 'stat']);
		$slashTiptap->set('features', ['toolbar', 'statusbar', 'pasteFilter', 'sourceCode', 'imgUpload', 'imgResize']);
		$slashTiptap->val('');

		$tiptapForm = $modules->get('InputfieldForm');
		$tiptapForm->attr('id+name', 'e2e_tiptap_slash_form');
		$tiptapForm->add($slashTiptap);
		$tiptapSlashSchemaFormProps = $serializer->serialize($tiptapForm, ['dirtyGuard' => false]);

		$iconInput = $iconField->getInputfield($hostPage);
		$iconInput->attr('id+name', $iconField->name);
		$iconForm = $modules->get('InputfieldForm');
		$iconForm->attr('id+name', 'e2e_icon_studio_form');
		$iconForm->add($iconInput);
		$iconSchemaFormProps = $serializer->serialize($iconForm, ['dirtyGuard' => false]);

		$gdImg = imagecreatetruecolor(120, 90);
		$bg = imagecolorallocate($gdImg, 20, 120, 210);
		imagefilledrectangle($gdImg, 0, 0, 120, 90, $bg);
		ob_start();
		imagepng($gdImg);
		$validPngBase64 = base64_encode((string) ob_get_clean());

		echo json_encode([
			'suffix' => $suffix,
			'validPngBase64' => $validPngBase64,
			'csrf' => [
				'name' => $wire->session->CSRF->getTokenName(),
				'value' => $wire->session->CSRF->getTokenValue(),
			],
			'hostPageId' => (int) $hostPage->id,
			'inlineSummaryPageId' => (int) $hostPage->id,
			'summaryFieldName' => $inlineField->name,
			'viewportRecordsPageIds' => $itemIds,
			'viewportProps' => $viewportProp,
			'mediaSchemaFormProps' => $mediaSchemaFormProps,
			'imageFieldName' => $imgField->name,
			'fileFieldName' => $fileField->name,
			'linkSchemaFormProps' => $linkSchemaFormProps,
			'linkFieldName' => $linkField->name,
			'iconSchemaFormProps' => $iconSchemaFormProps,
			'iconFieldName' => $iconField->name,
			'iconFieldId' => (int) $iconField->id,
			'relationSchemaFormProps' => $relationSchemaFormProps,
			'tiptapSlashSchemaFormProps' => $tiptapSlashSchemaFormProps,
		], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
	`);
}

export function destroyIsolatedE2EFixture(suffix?: string): void {
	const safeSuffix = (suffix || '').replace(/[^a-z0-9]/gi, '');
	try {
		runWirePhp(`
			$sfx = ${JSON.stringify(safeSuffix)};
			$pageSel = $sfx !== '' ? ('name^=rw-e2e-pw-, name$=-' . $sfx . ', include=all') : 'name^=rw-e2e-pw-, include=all';
			foreach ($wire->pages->find($pageSel) as $p) {
				try { $wire->pages->delete($p, true); } catch (\\Throwable $e) {}
			}
			$classesDir = rtrim((string) $wire->config->paths->classes, '/') . '/';
			foreach ($wire->templates->find('name^=rw_e2e_pw_') as $tpl) {
				$tplName = (string) $tpl->name;
				if ($sfx === '' || str_ends_with($tplName, '_' . $sfx)) {
					$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', $tplName)));
					try { $wire->templates->delete($tpl); } catch (\\Throwable $e) {}
					@unlink($classesDir . $pascal . 'Page.php');
				}
			}
			foreach ($wire->fieldgroups as $fg) {
				$fgName = (string) $fg->name;
				if (str_starts_with($fgName, 'rw_e2e_pw_') && ($sfx === '' || str_ends_with($fgName, '_' . $sfx))) {
					try { $wire->fieldgroups->delete($fg); } catch (\\Throwable $e) {}
				}
			}
			foreach ($wire->fields as $f) {
				$fName = (string) $f->name;
				if (str_starts_with($fName, 'rw_e2e_pw_') && ($sfx === '' || str_ends_with($fName, '_' . $sfx))) {
					try { $wire->fields->delete($f); } catch (\\Throwable $e) {}
				}
			}
			if ($wire->modules->isInstalled('React')) {
				try { \\ProcessWire\\React::instance()->icons()->generateAdminCss(); } catch (\\Throwable $e) {}
			}
			echo 'true';
		`);
	} catch {
		// Best-effort cleanup
	}
}
