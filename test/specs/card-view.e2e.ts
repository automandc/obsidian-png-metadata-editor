import { browser, expect, $, $$ } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { waitForSave } from './helpers';
import { decodeCardText } from '../../src/card/card';
import { parsePng } from '../../src/png/chunks';
import { readTextEntries } from '../../src/png/text';

let vaultPath: string;

interface CardJson {
	spec?: unknown;
	data?: Record<string, unknown>;
	[key: string]: unknown;
}

async function openFile(filePath: string) {
	await browser.executeObsidian(async ({ app, obsidian }, filePath) => {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof obsidian.TFile)) throw new Error(`No such file: ${filePath}`);
		await app.workspace.getLeaf(false).openFile(file);
	}, filePath);
}

/** The card JSON in each card chunk of a vault file, read straight from disk. */
function readCards(filePath: string): Record<string, CardJson> {
	const entries = readTextEntries(parsePng(new Uint8Array(readFileSync(join(vaultPath, filePath)))));
	const cards: Record<string, CardJson> = {};
	for (const e of entries) {
		if (e.keyword === 'chara' || e.keyword === 'ccv3') cards[e.keyword] = decodeCardText(e.text);
	}
	return cards;
}

function field(key: string) {
	return $(`.png-card-field[data-field="${key}"]`).$('input, textarea');
}

describe('SillyTavern card mode', function () {
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

	it('opens a card in the character card form', async function () {
		await openFile('images/sillytavern-card.png');
		await expect($('.png-metadata-mode button[data-mode="card"]')).toHaveElementClass('is-active');
		await expect($('.png-metadata-title')).toHaveText('sillytavern-card');
		await expect(field('name')).toHaveValue('Test Character');
		await expect(field('first_mes')).toHaveValue('Hello! I only exist in test fixtures.');
		await expect($$('.png-card-greeting')).toBeElementsArrayOfSize(2);
		await expect($('.png-card-info')).toHaveText(expect.stringContaining('V3 (ccv3) and V2 (chara)'));
	});

	it('does not offer card mode for an ordinary PNG', async function () {
		await openFile('images/text-chunks.png');
		await expect($('.png-metadata-mode')).not.toExist();
		await expect($('.png-metadata-entry')).toExist();
	});

	it('saves edits to both card chunks', async function () {
		await openFile('images/sillytavern-card.png');
		await field('name').setValue('Renamed in Obsidian');
		await field('tags').setValue('test, edited');
		await $('.png-card-add-greeting').click();
		const greetings = await $$('.png-card-greeting textarea').getElements();
		await greetings[greetings.length - 1]!.setValue('A third greeting.');
		await $('.png-metadata-save').click();
		await waitForSave();

		const cards = readCards('images/sillytavern-card.png');
		for (const keyword of ['chara', 'ccv3']) {
			const data = cards[keyword]!.data!;
			expect(data.name).toEqual('Renamed in Obsidian');
			expect(data.tags).toEqual(['test', 'edited']);
			expect(data.alternate_greetings).toEqual(['Hi there.', 'Greetings, traveller.', 'A third greeting.']);
		}
		expect(cards.ccv3!.spec).toEqual('chara_card_v3');
		expect(cards.chara!.spec).toEqual('chara_card_v2');
	});

	it('deletes an alternate greeting', async function () {
		await openFile('images/sillytavern-card.png');
		const remove = await $$('.png-card-greeting-delete')[0]!.getElement();
		// Keep the button clear of Obsidian's status bar, which overlaps the bottom of the pane.
		await browser.execute((el) => el.scrollIntoView({ block: 'center' }), remove);
		await remove.click();
		await expect($$('.png-card-greeting')).toBeElementsArrayOfSize(1);
		await $('.png-metadata-save').click();
		await waitForSave();
		expect(readCards('images/sillytavern-card.png').chara!.data!.alternate_greetings).toEqual([
			'Greetings, traveller.',
		]);
	});

	it('keeps the lorebook when editing a V2 card', async function () {
		await openFile('images/card-v2-only.png');
		await expect(field('name')).toHaveValue('Zoë 🌸');
		await expect($('.png-card-info')).toHaveText(expect.stringContaining('lorebook (2 entries)'));
		await field('personality').setValue('Edited personality');
		await $('.png-metadata-save').click();
		await waitForSave();

		const cards = readCards('images/card-v2-only.png');
		expect(Object.keys(cards)).toEqual(['chara']);
		const data = cards.chara!.data!;
		expect(data.personality).toEqual('Edited personality');
		expect((data.character_book as { entries: unknown[] }).entries).toHaveLength(2);
	});

	it('carries unsaved card edits over to raw mode and back', async function () {
		await openFile('images/sillytavern-card.png');
		await field('name').setValue('Unsaved name');
		await $('.png-metadata-mode button[data-mode="raw"]').click();
		await expect($('.png-metadata-add')).toExist();
		await expect($('.png-metadata-title')).toHaveText('sillytavern-card.png');
		await expect($('.png-metadata-status')).toHaveText('Unsaved changes');
		await $('.png-metadata-mode button[data-mode="card"]').click();
		await expect(field('name')).toHaveValue('Unsaved name');
	});

	it('explains a card it cannot read', async function () {
		await openFile('images/card-broken.png');
		await expect($('.png-card-error')).toHaveText(expect.stringContaining('Raw metadata'));
		await $('.png-metadata-mode button[data-mode="raw"]').click();
		await expect($('.png-metadata-entry .png-metadata-value')).toHaveValue('this is not a card');
	});
});
