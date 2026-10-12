import { FileView, TFile, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_PNG_METADATA = 'png-metadata-view';

export class PngMetadataView extends FileView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_PNG_METADATA;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'PNG metadata';
	}

	getIcon(): string {
		return 'file-image';
	}

	canAcceptExtension(extension: string): boolean {
		return extension.toLowerCase() === 'png';
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.render(file);
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.contentEl.empty();
	}

	private render(file: TFile) {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('png-metadata-view');

		const preview = contentEl.createDiv({ cls: 'png-metadata-preview' });
		preview.createEl('img', {
			attr: { src: this.app.vault.getResourcePath(file), alt: file.name },
		});

		const details = contentEl.createDiv({ cls: 'png-metadata-details' });
		details.createEl('h3', { text: file.name });
		details.createEl('p', {
			cls: 'png-metadata-placeholder',
			text: 'Metadata editing is coming in the next step.',
		});
	}
}
