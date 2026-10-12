/** Read-only panels for standard metadata: EXIF and XMP. */
import { ExifData, ExifGroup } from '../png/exif';
import { XmpProperty } from '../png/xmp';

const GROUP_LABELS: Record<ExifGroup, string> = {
	Image: 'Image',
	Photo: 'Camera',
	GPS: 'Location',
	Interoperability: 'Interoperability',
};

/** Labels for tags whose names don't read well when split into words. */
const LABELS: Record<string, string> = {
	FNumber: 'Aperture',
	ISOSpeedRatings: 'ISO',
	DateTime: 'Modified',
	DateTimeOriginal: 'Taken',
	DateTimeDigitized: 'Digitized',
	FocalLengthIn35mmFilm: 'Focal length (35 mm equivalent)',
	GPSLatitude: 'Latitude',
	GPSLatitudeRef: 'Latitude reference',
	GPSLongitude: 'Longitude',
	GPSLongitudeRef: 'Longitude reference',
	GPSAltitude: 'Altitude',
	GPSAltitudeRef: 'Altitude reference',
};

const ACRONYMS = ['GPS', 'ISO', 'ID', 'XP'];

/** Split "ExposureBiasValue" into "Exposure bias value" for display. */
function humanize(name: string): string {
	if (LABELS[name]) return LABELS[name];
	if (name.startsWith('0x')) return `Tag ${name}`;
	const words = name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(' ');
	return words
		.map((word, i) => {
			if (ACRONYMS.includes(word.toUpperCase())) return word.toUpperCase();
			const lower = word.toLowerCase();
			return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
		})
		.join(' ');
}

function panel(parent: HTMLElement, cls: string, title: string): HTMLElement {
	const details = parent.createEl('details', {
		cls: `png-metadata-section png-metadata-panel ${cls}`,
		attr: { open: '' },
	});
	details.createEl('summary', { text: title });
	return details;
}

function row(body: HTMLElement, label: string, value: string, key?: string): HTMLTableCellElement {
	const tr = body.createEl('tr', key ? { attr: { 'data-key': key } } : {});
	tr.createEl('th', { text: label, attr: { scope: 'row' } });
	return tr.createEl('td', { text: value });
}

export function renderExifPanel(parent: HTMLElement, exif: ExifData) {
	const details = panel(parent, 'png-exif', `EXIF (${exif.entries.length})`);
	details.createDiv({
		cls: 'png-metadata-panel-note',
		text: `Read-only. Stored in the ${exif.source === 'eXIf chunk' ? 'eXIf chunk' : `"${exif.source}" text field`}.`,
	});
	const table = details.createEl('table');
	const body = table.createEl('tbody');

	const groups: ExifGroup[] = ['Image', 'Photo', 'GPS', 'Interoperability'];
	for (const group of groups) {
		const entries = exif.entries.filter((e) => e.group === group);
		if (entries.length === 0) continue;
		body.createEl('tr', { cls: 'png-exif-group' }).createEl('th', {
			text: GROUP_LABELS[group],
			attr: { colspan: '2' },
		});
		if (group === 'GPS' && exif.gps) {
			const { latitude, longitude } = exif.gps;
			const cell = row(body, 'Position', '', 'GPS:Position');
			const text = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
			cell.createEl('a', {
				text,
				href: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`,
				attr: { title: 'Show on a map' },
			});
		}
		for (const entry of entries) {
			row(body, humanize(entry.name), entry.value, `${entry.group}:${entry.name}`);
		}
	}
}

export function renderXmpPanel(parent: HTMLElement, props: XmpProperty[]) {
	const details = panel(parent, 'png-xmp', `XMP (${props.length})`);
	details.createDiv({
		cls: 'png-metadata-panel-note',
		text: 'Summary of the XMP packet. Edit it as raw XML in its "XML:com.adobe.xmp" text field.',
	});
	const body = details.createEl('table').createEl('tbody');
	for (const prop of props) {
		row(body, prop.label, prop.value, prop.name);
	}
}

export function renderPanelError(parent: HTMLElement, what: string, message: string) {
	parent.createDiv({
		cls: 'png-metadata-section png-metadata-error png-metadata-panel-error',
		text: `Could not read the ${what}: ${message}`,
	});
}
