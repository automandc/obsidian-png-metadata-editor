import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'wdio.conf.mts',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'test/tsconfig.json',
		'test/output',
		'.obsidian-cache',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Tests run in Node (unit) or drive Obsidian from Node (UI), not inside the plugin.
		files: ['test/**/*.ts'],
		languageOptions: {
			globals: { ...globals.node, ...globals.mocha },
		},
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
