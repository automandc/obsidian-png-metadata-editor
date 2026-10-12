/** Read-only decoding of the standard PNG ancillary chunks into labelled rows. */
import { PngChunk } from './chunks';

export interface InfoRow {
	label: string;
	value: string;
	/** The chunk type the row was read from. */
	chunk: string;
}

const SRGB_INTENTS = ['Perceptual', 'Relative colorimetric', 'Saturation', 'Absolute colorimetric'];

function view(data: Uint8Array): DataView {
	return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function decodeChunk(chunk: PngChunk): InfoRow | null {
	const { type, data } = chunk;
	const dv = view(data);
	switch (type) {
		case 'tIME': {
			if (data.length < 7) return null;
			const date = `${dv.getUint16(0)}-${pad(data[2]!)}-${pad(data[3]!)}`;
			const time = `${pad(data[4]!)}:${pad(data[5]!)}:${pad(data[6]!)}`;
			return { label: 'Last modified', value: `${date} ${time} UTC`, chunk: type };
		}
		case 'pHYs': {
			if (data.length < 9) return null;
			const x = dv.getUint32(0);
			const y = dv.getUint32(4);
			if (data[8] === 1) {
				const dpi = (ppm: number) => Math.round(ppm * 0.0254);
				const value = x === y ? `${dpi(x)} dpi` : `${dpi(x)} × ${dpi(y)} dpi`;
				return { label: 'Resolution', value, chunk: type };
			}
			return { label: 'Pixel aspect ratio', value: `${x}:${y}`, chunk: type };
		}
		case 'gAMA':
			if (data.length < 4) return null;
			return { label: 'Gamma', value: String(dv.getUint32(0) / 100000), chunk: type };
		case 'sRGB':
			return {
				label: 'Color space',
				value: `sRGB, ${(SRGB_INTENTS[data[0] ?? 0] ?? 'unknown intent').toLowerCase()}`,
				chunk: type,
			};
		case 'iCCP': {
			const end = data.indexOf(0);
			const name = String.fromCharCode(...data.subarray(0, end < 0 ? 0 : end));
			return { label: 'Color profile', value: `${name || 'ICC profile'} (embedded)`, chunk: type };
		}
		case 'cHRM': {
			if (data.length < 8) return null;
			const wx = dv.getUint32(0) / 100000;
			const wy = dv.getUint32(4) / 100000;
			return { label: 'White point', value: `${wx}, ${wy}`, chunk: type };
		}
		case 'acTL': {
			if (data.length < 8) return null;
			const frames = dv.getUint32(0);
			const plays = dv.getUint32(4);
			const loops = plays === 0 ? 'loops forever' : `plays ${plays} time${plays === 1 ? '' : 's'}`;
			return { label: 'Animation', value: `${frames} frames, ${loops}`, chunk: type };
		}
		case 'sBIT':
			return { label: 'Significant bits', value: Array.from(data).join(', '), chunk: type };
		default:
			return null;
	}
}

export function readInfoRows(chunks: PngChunk[]): InfoRow[] {
	const rows: InfoRow[] = [];
	for (const chunk of chunks) {
		const row = decodeChunk(chunk);
		if (row) rows.push(row);
	}
	return rows;
}
