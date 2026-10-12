import { browser, $ } from '@wdio/globals';

/**
 * Wait until a save started by clicking Save has finished writing the file.
 * The Save button is disabled while saving too, so it is not enough on its own.
 */
export async function waitForSave() {
	await browser.waitUntil(
		async () =>
			!(await $('.png-metadata-view.is-saving').isExisting()) &&
			(await $('.png-metadata-save').isEnabled()) === false &&
			(await $('.png-metadata-status').getText()) !== 'Unsaved changes',
		{ timeoutMsg: 'Save did not finish' },
	);
}
