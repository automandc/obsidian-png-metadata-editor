import { browser, expect, $, $$ } from '@wdio/globals';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { parsePng } from '../../src/png/chunks';
import { readTextEntries } from '../../src/png/text';

const PLUGIN_ID = 'png-metadata-editor';
const VIEW_TYPE = 'png-metadata-view';

let vaultPath: string;

/** Open a vault file in the active tab the way clicking it in the file explorer does. */
async function openFile(filePath: string) {
	await browser.executeObsidian(async ({ app, obsidian }, filePath) => {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof obsidian.TFile)) throw new Error(`No such file: ${filePath}`);
		await app.workspace.getLeaf(false).openFile(file);
	}, filePath);
}

async function activeViewType(): Promise<string | undefined> {
	return browser.executeObsidian(({ app }) => app.workspace.getMostRecentLeaf()?.view.getViewType());
}

async function setOpenPngByDefault(value: boolean) {
	await browser.executeObsidian(
		({ app }, pluginId, value) => {
			const plugins = (app as unknown as {
				plugins: { plugins: Record<string, { settings: { openPngByDefault: boolean }; applyPngHandler(): void }> };
			}).plugins.plugins;
			const plugin = plugins[pluginId]!;
			plugin.settings.openPngByDefault = value;
			plugin.applyPngHandler();
		},
		PLUGIN_ID,
		value,
	);
}

function readVaultPng(filePath: string) {
	return readTextEntries(parsePng(new Uint8Array(readFileSync(join(vaultPath, filePath)))));
}

/** The metadata entry whose keyword input holds the given keyword. */
async function entryFor(keyword: string) {
	const entries = await $$('.png-metadata-entry').getElements();
	for (const entry of entries) {
		if ((await entry.$('.png-metadata-keyword').getValue()) === keyword) return entry;
	}
	throw new Error(`No entry with keyword ${keyword}`);
}

describe('PNG metadata view', function () {
	before(async function () {
		vaultPath = await browser.executeObsidian(({ app, obsidian }) => {
			const adapter = app.vault.adapter;
			if (!(adapter instanceof obsidian.FileSystemAdapter)) throw new Error('Not a desktop vault');
			return adapter.getBasePath();
		});
	});

	beforeEach(async function () {
		await obsidianPage.resetVault('test/vaults/simple');
		await setOpenPngByDefault(true);
	});

	it('opens PNG files in the metadata view with a preview', async function () {
		await openFile('images/text-chunks.png');
		expect(await activeViewType()).toEqual(VIEW_TYPE);
		await expect($('.png-metadata-preview img')).toExist();
		await expect($('.png-metadata-info')).toHaveText(expect.stringContaining('64 × 64'));
	});

	it('lists every text field in the file', async function () {
		await openFile('images/text-chunks.png');
		const keywords = await $$('.png-metadata-keyword').map((el) => el.getValue());
		expect([...keywords].sort()).toEqual(['Comment', 'Compressed', 'Description', 'Title']);
		const description = await entryFor('Description');
		await expect(description.$('.png-metadata-value')).toHaveValue('Unicode text: café, naïve, 日本語');
		await expect(description.$('.png-metadata-type')).toHaveValue('iTXt');
	});

	it('shows an empty state for a PNG without text', async function () {
		await openFile('images/plain.png');
		await expect($('.png-metadata-empty')).toExist();
		await expect($('.png-metadata-save')).toBeDisabled();
	});

	it('saves an edited value to the file and keeps a backup', async function () {
		await openFile('images/text-chunks.png');
		await expect($('.png-metadata-save')).toBeDisabled();

		const title = await entryFor('Title');
		await title.$('.png-metadata-value').setValue('Edited in Obsidian');
		await expect($('.png-metadata-status')).toHaveText('Unsaved changes');
		await $('.png-metadata-save').click();
		await expect($('.png-metadata-save')).toBeDisabled();

		const entries = readVaultPng('images/text-chunks.png');
		expect(entries.find((e) => e.keyword === 'Title')?.text).toEqual('Edited in Obsidian');
		expect(entries.find((e) => e.keyword === 'Comment')?.text).toEqual('Stored compressed in zTXt');

		const backup = join(vaultPath, 'images/text-chunks.png.bak');
		expect(existsSync(backup)).toBe(true);
		const original = readTextEntries(parsePng(new Uint8Array(readFileSync(backup))));
		expect(original.find((e) => e.keyword === 'Title')?.text).toEqual('Sample image');
	});

	it('adds and deletes fields', async function () {
		await openFile('images/text-chunks.png');
		await (await entryFor('Comment')).$('.png-metadata-delete').click();

		await $('.png-metadata-add').click();
		const all = await $$('.png-metadata-entry').getElements();
		const added = all[all.length - 1]!;
		await added.$('.png-metadata-keyword').setValue('Author');
		await added.$('.png-metadata-value').setValue('Test author');
		await $('.png-metadata-save').click();
		await expect($('.png-metadata-save')).toBeDisabled();

		const keywords = readVaultPng('images/text-chunks.png').map((e) => e.keyword);
		expect([...keywords].sort()).toEqual(['Author', 'Compressed', 'Description', 'Title']);
	});

	it('blocks saving while a field is invalid', async function () {
		await openFile('images/text-chunks.png');
		await $('.png-metadata-add').click();
		await expect($('.png-metadata-entry.is-invalid .png-metadata-entry-error')).toHaveText(
			expect.stringContaining('1 to 79 characters'),
		);
		await expect($('.png-metadata-save')).toBeDisabled();

		const title = await entryFor('Title');
		await title.$('.png-metadata-value').setValue('日本語');
		await expect(title.$('.png-metadata-entry-error')).toHaveText(expect.stringContaining('Latin-1'));
		await title.$('.png-metadata-type').selectByAttribute('value', 'iTXt');
		await expect(title.$('.png-metadata-entry-error')).not.toBeDisplayed();
	});

	it('reverts unsaved edits', async function () {
		await openFile('images/text-chunks.png');
		await (await entryFor('Title')).$('.png-metadata-value').setValue('Not saved');
		await $('.png-metadata-revert').click();
		await expect((await entryFor('Title')).$('.png-metadata-value')).toHaveValue('Sample image');
		expect(readVaultPng('images/text-chunks.png').find((e) => e.keyword === 'Title')?.text).toEqual(
			'Sample image',
		);
	});

	it('hands PNGs back to the image viewer when the setting is off', async function () {
		await setOpenPngByDefault(false);
		await openFile('images/plain.png');
		expect(await activeViewType()).toEqual('image');

		await browser.executeObsidianCommand(`${PLUGIN_ID}:open-active-png`);
		await browser.waitUntil(async () => (await activeViewType()) === VIEW_TYPE);
	});
});
