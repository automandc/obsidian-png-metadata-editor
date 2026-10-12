import { App, PluginSettingTab, Setting } from 'obsidian';
import PngMetadataPlugin from './main';

export interface PngMetadataSettings {
	openPngByDefault: boolean;
	backupOnSave: boolean;
}

export const DEFAULT_SETTINGS: PngMetadataSettings = {
	openPngByDefault: true,
	backupOnSave: true,
};

export class PngMetadataSettingTab extends PluginSettingTab {
	plugin: PngMetadataPlugin;

	constructor(app: App, plugin: PngMetadataPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Open PNG files in metadata view')
			.setDesc(
				'When on, clicking a PNG in the file explorer opens it in this plugin instead of the built-in image viewer.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openPngByDefault)
					.onChange(async (value) => {
						this.plugin.settings.openPngByDefault = value;
						await this.plugin.saveSettings();
						this.plugin.applyPngHandler();
					}),
			);

		new Setting(containerEl)
			.setName('Back up before first save')
			.setDesc(
				'Before a PNG is changed for the first time, keep a copy of the original next to it with a .bak extension. Later saves keep that original copy.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.backupOnSave)
					.onChange(async (value) => {
						this.plugin.settings.backupOnSave = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
