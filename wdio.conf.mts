import * as path from 'path';
import { env } from 'process';
import { parseObsidianVersions } from 'wdio-obsidian-service';

// wdio-obsidian-service downloads Obsidian builds into this directory.
const cacheDir = path.resolve('.obsidian-cache');

// "app/installer" version pairs; "earliest" means the manifest's minAppVersion.
const versions = await parseObsidianVersions(
	env.OBSIDIAN_VERSIONS ?? 'earliest/earliest latest/latest',
	{ cacheDir },
);
if (env.CI) {
	// Printed so the workflow can use the resolved versions as its cache key.
	console.log('obsidian-cache-key:', JSON.stringify(versions));
}

export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'mocha',
	specs: ['./test/specs/**/*.e2e.ts'],
	maxInstances: Number(env.WDIO_MAX_INSTANCES || 4),

	capabilities: versions.map<WebdriverIO.Capabilities>(([appVersion, installerVersion]) => ({
		browserName: 'obsidian',
		'wdio:obsidianOptions': {
			appVersion,
			installerVersion,
			plugins: ['.'],
			vault: 'test/vaults/simple',
		},
	})),

	services: ['obsidian'],
	reporters: ['obsidian'],

	mochaOpts: {
		ui: 'bdd',
		timeout: 60 * 1000,
	},
	waitforInterval: 250,
	waitforTimeout: 5 * 1000,
	logLevel: 'warn',

	cacheDir,

	injectGlobals: false,
};
