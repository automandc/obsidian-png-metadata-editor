import { browser } from '@wdio/globals';
import { describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

const PLUGIN_ID = 'png-metadata-editor';
const VIEW_TYPE = 'png-metadata-view';

// Kept out of png-view.e2e.ts: resetVault there removes the plugin's files,
// so the plugin can't be enabled again after it is disabled.
describe('Enabling the plugin', function () {
	it('takes over PNG tabs that were open before the plugin was enabled', async function () {
		await obsidianPage.disablePlugin(PLUGIN_ID);
		await browser.executeObsidian(async ({ app, obsidian }) => {
			const file = app.vault.getAbstractFileByPath('images/plain.png');
			if (!(file instanceof obsidian.TFile)) throw new Error('No such file: images/plain.png');
			await app.workspace.getLeaf(false).openFile(file);
		});
		const activeViewType = () =>
			browser.executeObsidian(({ app }) => app.workspace.getMostRecentLeaf()?.view.getViewType());
		await browser.waitUntil(async () => (await activeViewType()) === 'image');

		// What installing from Community plugins does after the files are downloaded.
		await obsidianPage.enablePlugin(PLUGIN_ID);
		await browser.waitUntil(async () => (await activeViewType()) === VIEW_TYPE);
	});
});
