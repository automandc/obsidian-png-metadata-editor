import { FileView, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { Card, hasCard, readCard, writeCardToEntries } from '../card/card';
import type PngMetadataPlugin from '../main';
import { encodePng, parsePng, PngChunk, PngHeader, readHeader } from '../png/chunks';
import { ExifData, findExif } from '../png/exif';
import { InfoRow, readInfoRows } from '../png/info';
import { parseXmp, XMP_KEYWORD, XmpProperty } from '../png/xmp';
import { renderExifPanel, renderPanelError, renderXmpPanel } from './metadata-panels';
import { renderCardForm } from './card-form';
import {
	applyTextEntries,
	EditableTextEntry,
	isTextChunkType,
	readTextEntries,
	TEXT_CHUNK_TYPES,
	TextChunkType,
	validateTextEntry,
} from '../png/text';

export const VIEW_TYPE_PNG_METADATA = 'png-metadata-view';

/** "card" shows the SillyTavern form; "raw" lists every text chunk. */
type ViewMode = 'card' | 'raw';

const COLOR_TYPES: Record<number, string> = {
	0: 'Grayscale',
	2: 'RGB',
	3: 'Indexed',
	4: 'Grayscale + alpha',
	6: 'RGBA',
};

const TYPE_LABELS: Record<TextChunkType, string> = {
	tEXt: 'tEXt (Latin-1)',
	zTXt: 'zTXt (compressed Latin-1)',
	iTXt: 'iTXt (Unicode)',
};

export class PngMetadataView extends FileView {
	private plugin: PngMetadataPlugin;
	private chunks: PngChunk[] = [];
	private entries: EditableTextEntry[] = [];
	private header: PngHeader | null = null;
	private infoRows: InfoRow[] = [];
	private exif: ExifData | null = null;
	private exifError: string | null = null;
	private xmp: XmpProperty[] | null = null;
	private xmpError: string | null = null;
	private fileSize = 0;
	private loadError: string | null = null;
	/** True when entries were added, removed or edited since the last load or save. */
	private dirty = false;
	private saving = false;
	private mode: ViewMode = 'raw';

	private entriesEl!: HTMLElement;
	private saveButton!: HTMLButtonElement;
	private revertButton!: HTMLButtonElement;
	private statusEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: PngMetadataPlugin) {
		super(leaf);
		this.plugin = plugin;
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

	// Obsidian reuses an open view for the next file when this returns true, so
	// only keep PNGs here while this plugin is their default handler.
	canAcceptExtension(extension: string): boolean {
		return this.plugin.settings.openPngByDefault && extension.toLowerCase() === 'png';
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				// Pick up changes made outside this view, unless there are unsaved edits here.
				if (this.file && file.path === this.file.path && !this.saving && !this.dirty) {
					void this.loadFromDisk(this.file, true);
				}
			}),
		);
	}

	async onLoadFile(file: TFile): Promise<void> {
		await this.loadFromDisk(file, false);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		if (this.dirty) {
			new Notice(`Unsaved metadata changes to ${file.name} were discarded.`);
		}
		this.dirty = false;
		this.contentEl.empty();
	}

	/** Read the file and re-render. `keepMode` keeps the Card/Raw choice, for reloads of the same file. */
	private async loadFromDisk(file: TFile, keepMode: boolean) {
		const bytes = new Uint8Array(await this.app.vault.readBinary(file));
		this.fileSize = bytes.length;
		try {
			this.chunks = parsePng(bytes);
			this.header = readHeader(this.chunks);
			this.entries = readTextEntries(this.chunks);
			this.loadError = null;
			this.readStandardMetadata();
		} catch (e) {
			this.chunks = [];
			this.header = null;
			this.entries = [];
			this.loadError = e instanceof Error ? e.message : String(e);
		}
		this.dirty = false;
		if (!keepMode || !hasCard(this.entries)) {
			this.mode = hasCard(this.entries) ? 'card' : 'raw';
		}
		this.render(file);
	}

	/** Decode the read-only metadata from the file as loaded. Problems are shown, not thrown. */
	private readStandardMetadata() {
		this.infoRows = readInfoRows(this.chunks);
		this.exif = null;
		this.exifError = null;
		try {
			this.exif = findExif(this.chunks, this.entries);
		} catch (e) {
			this.exifError = e instanceof Error ? e.message : String(e);
		}
		this.xmp = null;
		this.xmpError = null;
		const xmp = this.entries.find((e) => e.keyword === XMP_KEYWORD);
		if (xmp) {
			try {
				this.xmp = parseXmp(xmp.text);
			} catch (e) {
				this.xmpError = e instanceof Error ? e.message : String(e);
			}
		}
	}

	private render(file: TFile) {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('png-metadata-view');

		const top = contentEl.createDiv({ cls: 'png-metadata-top' });
		const preview = top.createDiv({ cls: 'png-metadata-preview' });
		preview.createEl('img', {
			attr: { src: this.app.vault.getResourcePath(file), alt: file.name },
		});
		this.renderInfo(top.createDiv({ cls: 'png-metadata-info' }), file);

		if (this.loadError) {
			contentEl.createDiv({
				cls: 'png-metadata-error png-metadata-load-error',
				text: `Could not read this PNG's metadata: ${this.loadError}`,
			});
			return;
		}

		if (this.exif) renderExifPanel(contentEl, this.exif);
		if (this.exifError) renderPanelError(contentEl, 'EXIF data', this.exifError);
		if (this.xmp) renderXmpPanel(contentEl, this.xmp);
		if (this.xmpError) renderPanelError(contentEl, 'XMP data', this.xmpError);

		const section = contentEl.createDiv({ cls: 'png-metadata-section' });
		const heading = section.createDiv({ cls: 'png-metadata-section-header' });
		if (hasCard(this.entries)) {
			this.renderModeSwitch(heading, file);
		} else {
			heading.createEl('h4', { text: 'Text metadata' });
		}

		const toolbar = heading.createDiv({ cls: 'png-metadata-toolbar' });
		if (this.mode === 'raw') {
			const addButton = toolbar.createEl('button', { cls: 'png-metadata-add', text: 'Add field' });
			addButton.addEventListener('click', () => this.addEntry());
		}
		this.revertButton = toolbar.createEl('button', { cls: 'png-metadata-revert', text: 'Revert' });
		this.revertButton.addEventListener('click', () => void this.loadFromDisk(file, true));
		this.saveButton = toolbar.createEl('button', { cls: 'png-metadata-save mod-cta', text: 'Save' });
		this.saveButton.addEventListener('click', () => void this.save());

		this.statusEl = section.createDiv({ cls: 'png-metadata-status' });
		this.entriesEl = section.createDiv({ cls: 'png-metadata-entries' });
		if (this.mode === 'card') {
			this.renderCard();
		} else {
			this.renderEntries();
		}

		this.renderOtherChunks(contentEl);
	}

	private renderModeSwitch(parent: HTMLElement, file: TFile) {
		const modes: [ViewMode, string][] = [
			['card', 'Character card'],
			['raw', 'Raw metadata'],
		];
		const group = parent.createDiv({ cls: 'png-metadata-mode', attr: { role: 'tablist' } });
		for (const [mode, label] of modes) {
			const button = group.createEl('button', {
				text: label,
				attr: { 'data-mode': mode, role: 'tab', 'aria-selected': String(this.mode === mode) },
			});
			button.toggleClass('is-active', this.mode === mode);
			button.addEventListener('click', () => {
				if (this.mode === mode) return;
				// Both modes edit the same entries, so unsaved edits carry over.
				this.mode = mode;
				this.render(file);
				this.updateControls();
			});
		}
	}

	private renderCard() {
		let card: Card | null;
		try {
			card = readCard(this.entries);
		} catch (e) {
			this.entriesEl.createDiv({
				cls: 'png-metadata-error png-card-error',
				text: `This character card can't be read: ${e instanceof Error ? e.message : String(e)}. Switch to Raw metadata to see or fix the data.`,
			});
			this.updateControls();
			return;
		}
		if (!card) return;
		const loaded = card;
		renderCardForm(this.entriesEl, loaded, (fields) => {
			writeCardToEntries(this.entries, loaded, fields);
			this.dirty = true;
			this.updateControls();
		});
		this.updateControls();
	}

	private renderInfo(el: HTMLElement, file: TFile) {
		el.createEl('h3', { text: file.name });
		const rows: [string, string][] = [['File size', formatBytes(this.fileSize)]];
		if (this.header) {
			const { width, height, bitDepth, colorType, interlaced } = this.header;
			rows.unshift(['Dimensions', `${width} × ${height}`]);
			rows.push(
				['Color', `${COLOR_TYPES[colorType] ?? `Type ${colorType}`}, ${bitDepth}-bit`],
				['Interlaced', interlaced ? 'Yes' : 'No'],
			);
		}
		for (const info of this.infoRows) rows.push([info.label, info.value]);
		const dl = el.createEl('dl');
		for (const [label, value] of rows) {
			dl.createEl('dt', { text: label });
			dl.createEl('dd', { text: value });
		}
	}

	private renderEntries() {
		this.entriesEl.empty();
		if (this.entries.length === 0) {
			this.entriesEl.createDiv({
				cls: 'png-metadata-empty',
				text: 'This PNG has no text metadata. Use "Add field" to create some.',
			});
		}
		this.entries.forEach((entry) => this.renderEntry(entry));
		this.updateControls();
	}

	private renderEntry(entry: EditableTextEntry) {
		const row = this.entriesEl.createDiv({ cls: 'png-metadata-entry' });

		const head = row.createDiv({ cls: 'png-metadata-entry-head' });
		const keyword = head.createEl('input', {
			cls: 'png-metadata-keyword',
			attr: { type: 'text', placeholder: 'Keyword', 'aria-label': 'Keyword' },
		});
		keyword.value = entry.keyword;

		const type = head.createEl('select', {
			cls: 'dropdown png-metadata-type',
			attr: { 'aria-label': 'Chunk type' },
		});
		for (const t of TEXT_CHUNK_TYPES) {
			type.createEl('option', { value: t, text: TYPE_LABELS[t] });
		}
		type.value = entry.type;

		const remove = head.createEl('button', {
			cls: 'clickable-icon png-metadata-delete',
			attr: { 'aria-label': 'Delete field' },
		});
		setIcon(remove, 'trash-2');

		const value = row.createEl('textarea', {
			cls: 'png-metadata-value',
			attr: { 'aria-label': 'Value', spellcheck: 'false' },
		});
		value.value = entry.text;
		value.rows = Math.min(10, Math.max(2, entry.text.split('\n').length));

		const error = row.createDiv({ cls: 'png-metadata-error png-metadata-entry-error' });

		const refreshError = () => {
			const problem = validateTextEntry(entry);
			error.setText(problem ?? '');
			error.toggle(problem !== null);
			row.toggleClass('is-invalid', problem !== null);
		};
		const changed = () => {
			entry.dirty = true;
			this.dirty = true;
			refreshError();
			this.updateControls();
		};

		keyword.addEventListener('input', () => {
			entry.keyword = keyword.value;
			changed();
		});
		value.addEventListener('input', () => {
			entry.text = value.value;
			changed();
		});
		type.addEventListener('change', () => {
			if (isTextChunkType(type.value)) entry.type = type.value;
			changed();
		});
		remove.addEventListener('click', () => {
			this.entries.remove(entry);
			this.dirty = true;
			this.renderEntries();
		});

		refreshError();
	}

	private renderOtherChunks(parent: HTMLElement) {
		const others = this.chunks.filter((c) => !isTextChunkType(c.type));
		const details = parent.createEl('details', { cls: 'png-metadata-section png-metadata-chunks' });
		details.createEl('summary', { text: `Other chunks (${others.length})` });
		const table = details.createEl('table');
		const headRow = table.createEl('thead').createEl('tr');
		headRow.createEl('th', { text: 'Type' });
		headRow.createEl('th', { text: 'Size' });
		const body = table.createEl('tbody');
		for (const chunk of others) {
			const tr = body.createEl('tr');
			tr.createEl('td', { text: chunk.type });
			tr.createEl('td', { text: formatBytes(chunk.data.length) });
		}
	}

	private addEntry() {
		const entry: EditableTextEntry = { type: 'tEXt', keyword: '', text: '', dirty: true };
		this.entries.push(entry);
		this.dirty = true;
		this.renderEntries();
		const inputs = this.entriesEl.querySelectorAll<HTMLInputElement>('.png-metadata-keyword');
		inputs[inputs.length - 1]?.focus();
	}

	private invalidCount(): number {
		return this.entries.filter((e) => validateTextEntry(e) !== null).length;
	}

	private updateControls() {
		const invalid = this.invalidCount();
		this.saveButton.disabled = !this.dirty || invalid > 0 || this.saving;
		this.revertButton.disabled = !this.dirty || this.saving;
		if (invalid > 0) {
			this.statusEl.setText(`Fix ${invalid} field${invalid === 1 ? '' : 's'} before saving.`);
		} else {
			this.statusEl.setText(this.dirty ? 'Unsaved changes' : '');
		}
	}

	private async save() {
		const file = this.file;
		if (!file || !this.dirty || this.invalidCount() > 0) return;
		this.saving = true;
		this.updateControls();
		try {
			const original = await this.app.vault.readBinary(file);
			if (this.plugin.settings.backupOnSave) {
				await this.writeBackup(file, original);
			}
			const updated = encodePng(applyTextEntries(this.chunks, this.entries));
			// Check the result is a valid PNG before touching the file.
			parsePng(updated);
			await this.app.vault.modifyBinary(file, toArrayBuffer(updated));
			new Notice(`Saved metadata to ${file.name}`);
		} catch (e) {
			new Notice(`Could not save ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
			return;
		} finally {
			this.saving = false;
		}
		await this.loadFromDisk(file, true);
	}

	/** Keep a copy of the file as it was before the first save, next to it as NAME.png.bak. */
	private async writeBackup(file: TFile, original: ArrayBuffer) {
		const path = `${file.path}.bak`;
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			await adapter.writeBinary(path, original);
		}
	}
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
