import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	PngMetadataSettings,
	PngMetadataSettingTab,
} from './settings';
import { PngMetadataView, VIEW_TYPE_PNG_METADATA } from './ui/png-view';

// Obsidian's built-in image viewer, which owns .png by default.
const CORE_IMAGE_VIEW = 'image';

interface ViewRegistry {
	getTypeByExtension(ext: string): string | undefined;
	unregisterExtensions(exts: string[]): void;
	registerExtensions(exts: string[], type: string): void;
}

export default class PngMetadataPlugin extends Plugin {
	settings!: PngMetadataSettings;
	private ownsPngExtension = false;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_PNG_METADATA,
			(leaf: WorkspaceLeaf) => new PngMetadataView(leaf),
		);

		this.addCommand({
			id: 'open-active-png',
			name: 'Open current PNG in metadata view',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension.toLowerCase() !== 'png') {
					return false;
				}
				if (!checking) {
					void this.openInMetadataView(file);
				}
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'png') {
					return;
				}
				menu.addItem((item) =>
					item
						.setTitle('Open in metadata view')
						.setIcon('file-image')
						.onClick(() => void this.openInMetadataView(file)),
				);
			}),
		);

		this.addSettingTab(new PngMetadataSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => this.applyPngHandler());
	}

	onunload() {
		this.releasePngExtension();
	}

	async openInMetadataView(file: TFile) {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({
			type: VIEW_TYPE_PNG_METADATA,
			state: { file: file.path },
			active: true,
		});
	}

	/** Make this plugin the default handler for .png files, or hand them back to Obsidian. */
	applyPngHandler() {
		if (this.settings.openPngByDefault) {
			this.claimPngExtension();
		} else {
			this.releasePngExtension();
		}
	}

	// Obsidian throws if an extension is registered twice, so the core image
	// viewer's claim on .png has to be removed first and restored on unload.
	// viewRegistry is not part of the public API.
	private get viewRegistry(): ViewRegistry {
		return (this.app as unknown as { viewRegistry: ViewRegistry }).viewRegistry;
	}

	private claimPngExtension() {
		if (this.ownsPngExtension) return;
		const registry = this.viewRegistry;
		if (registry.getTypeByExtension('png')) {
			registry.unregisterExtensions(['png']);
		}
		registry.registerExtensions(['png'], VIEW_TYPE_PNG_METADATA);
		this.ownsPngExtension = true;
	}

	private releasePngExtension() {
		if (!this.ownsPngExtension) return;
		const registry = this.viewRegistry;
		registry.unregisterExtensions(['png']);
		registry.registerExtensions(['png'], CORE_IMAGE_VIEW);
		this.ownsPngExtension = false;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PngMetadataSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
