import { browser, expect, $, $$ } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { waitForSave } from './helpers';
import { parsePng } from '../../src/png/chunks';
import { findExif } from '../../src/png/exif';
import { readTextEntries } from '../../src/png/text';

let vaultPath: string;

async function openFile(filePath: string) {
	await browser.executeObsidian(async ({ app, obsidian }, filePath) => {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof obsidian.TFile)) throw new Error(`No such file: ${filePath}`);
		await app.workspace.getLeaf(false).openFile(file);
	}, filePath);
}

function exifRow(key: string) {
	return $(`.png-exif tr[data-key="${key}"] td`);
}

describe('Standard metadata panels', function () {
	before(async function () {
		vaultPath = await browser.executeObsidian(({ app, obsidian }) => {
			const adapter = app.vault.adapter;
			if (!(adapter instanceof obsidian.FileSystemAdapter)) throw new Error('Not a desktop vault');
			return adapter.getBasePath();
		});
	});

	beforeEach(async function () {
		await obsidianPage.resetVault('test/vaults/simple');
	});

	it('shows EXIF from a camera photo', async function () {
		await openFile('images/photo.png');
		await expect($('.png-exif summary')).toHaveText(expect.stringContaining('EXIF'));
		await expect(exifRow('Image:Make')).toHaveText('Canon');
		await expect(exifRow('Image:Model')).toHaveText('EOS R5');
		await expect(exifRow('Photo:ExposureTime')).toHaveText('1/250 s');
		await expect(exifRow('Photo:FNumber')).toHaveText('f/2.8');
		await expect(exifRow('GPS:Position')).toHaveText('40.71280, -74.00600');
		await expect($('.png-exif tr[data-key="GPS:Position"] a')).toHaveAttribute(
			'href',
			expect.stringContaining('openstreetmap.org'),
		);
	});

	it('shows XMP properties and PNG info chunks', async function () {
		await openFile('images/photo.png');
		await expect($('.png-xmp tr[data-key="dc:title"] td')).toHaveText('Gradient study');
		await expect($('.png-xmp tr[data-key="dc:subject"] td')).toHaveText('test, gradient');
		const info = $('.png-metadata-info');
		await expect(info).toHaveText(expect.stringContaining('300 dpi'));
		await expect(info).toHaveText(expect.stringContaining('2026-10-11 14:30:00 UTC'));
		await expect(info).toHaveText(expect.stringContaining('Color profile'));
	});

	it('reads EXIF that ImageMagick stored in a text field', async function () {
		await openFile('images/imagemagick-exif.png');
		await expect($('.png-exif .png-metadata-panel-note')).toHaveText(
			expect.stringContaining('Raw profile type exif'),
		);
		await expect(exifRow('Image:Make')).toHaveText('Canon');
	});

	it('shows no panels for a PNG without standard metadata', async function () {
		await openFile('images/text-chunks.png');
		await expect($('.png-exif')).not.toExist();
		await expect($('.png-xmp')).not.toExist();
	});

	it('keeps EXIF and other chunks when text fields are saved', async function () {
		const path = join(vaultPath, 'images/photo.png');
		const before = parsePng(new Uint8Array(readFileSync(path)));

		await openFile('images/photo.png');
		await $('.png-metadata-add').click();
		const entries = await $$('.png-metadata-entry').getElements();
		const added = entries[entries.length - 1]!;
		await added.$('.png-metadata-keyword').setValue('Comment');
		await added.$('.png-metadata-value').setValue('Added in Obsidian');
		await $('.png-metadata-save').click();
		await waitForSave();

		const after = parsePng(new Uint8Array(readFileSync(path)));
		const types = (chunks: typeof before) => chunks.map((c) => c.type).filter((t) => t !== 'tEXt');
		expect(types(after)).toEqual(types(before));
		const exif = findExif(after, readTextEntries(after));
		expect(exif?.entries.find((e) => e.name === 'Make')?.value).toEqual('Canon');
		await expect(exifRow('Image:Make')).toHaveText('Canon');
	});
});
