/**
 * Read-only EXIF decoding. PNG stores EXIF as a TIFF structure, either in an
 * eXIf chunk or, as ImageMagick writes it, hex-encoded in a
 * "Raw profile type exif" text chunk.
 */
import { PngChunk } from './chunks';
import { TextEntry } from './text';

export type ExifGroup = 'Image' | 'Photo' | 'GPS' | 'Interoperability';

export interface ExifEntry {
	group: ExifGroup;
	tag: number;
	/** Tag name, e.g. "Make", or a hex id for tags this decoder doesn't know. */
	name: string;
	/** Human-readable value. */
	value: string;
	/** The decoded value: text, numbers (rationals as decimals), or null for binary data. */
	raw: string | number[] | null;
}

export interface ExifData {
	littleEndian: boolean;
	entries: ExifEntry[];
	/** Decimal latitude/longitude from the GPS tags, when present. */
	gps?: { latitude: number; longitude: number };
	/** Where the EXIF came from: "eXIf chunk" or the text chunk keyword. */
	source: string;
}

const IFD_POINTERS: Record<number, ExifGroup> = { 0x8769: 'Photo', 0x8825: 'GPS', 0xa005: 'Interoperability' };

const IMAGE_TAGS: Record<number, string> = {
	0x010e: 'ImageDescription',
	0x010f: 'Make',
	0x0110: 'Model',
	0x0112: 'Orientation',
	0x011a: 'XResolution',
	0x011b: 'YResolution',
	0x0128: 'ResolutionUnit',
	0x0131: 'Software',
	0x0132: 'DateTime',
	0x013b: 'Artist',
	0x013e: 'WhitePoint',
	0x013f: 'PrimaryChromaticities',
	0x0213: 'YCbCrPositioning',
	0x8298: 'Copyright',
	0x9c9b: 'XPTitle',
	0x9c9c: 'XPComment',
	0x9c9d: 'XPAuthor',
	0x9c9e: 'XPKeywords',
	0x9c9f: 'XPSubject',
};

const PHOTO_TAGS: Record<number, string> = {
	0x829a: 'ExposureTime',
	0x829d: 'FNumber',
	0x8822: 'ExposureProgram',
	0x8827: 'ISOSpeedRatings',
	0x8830: 'SensitivityType',
	0x9000: 'ExifVersion',
	0x9003: 'DateTimeOriginal',
	0x9004: 'DateTimeDigitized',
	0x9010: 'OffsetTime',
	0x9011: 'OffsetTimeOriginal',
	0x9101: 'ComponentsConfiguration',
	0x9201: 'ShutterSpeedValue',
	0x9202: 'ApertureValue',
	0x9203: 'BrightnessValue',
	0x9204: 'ExposureBiasValue',
	0x9205: 'MaxApertureValue',
	0x9206: 'SubjectDistance',
	0x9207: 'MeteringMode',
	0x9208: 'LightSource',
	0x9209: 'Flash',
	0x920a: 'FocalLength',
	0x927c: 'MakerNote',
	0x9286: 'UserComment',
	0x9290: 'SubSecTime',
	0x9291: 'SubSecTimeOriginal',
	0x9292: 'SubSecTimeDigitized',
	0xa000: 'FlashpixVersion',
	0xa001: 'ColorSpace',
	0xa002: 'PixelXDimension',
	0xa003: 'PixelYDimension',
	0xa20e: 'FocalPlaneXResolution',
	0xa20f: 'FocalPlaneYResolution',
	0xa210: 'FocalPlaneResolutionUnit',
	0xa217: 'SensingMethod',
	0xa300: 'FileSource',
	0xa301: 'SceneType',
	0xa401: 'CustomRendered',
	0xa402: 'ExposureMode',
	0xa403: 'WhiteBalance',
	0xa404: 'DigitalZoomRatio',
	0xa405: 'FocalLengthIn35mmFilm',
	0xa406: 'SceneCaptureType',
	0xa408: 'Contrast',
	0xa409: 'Saturation',
	0xa40a: 'Sharpness',
	0xa420: 'ImageUniqueID',
	0xa430: 'CameraOwnerName',
	0xa431: 'BodySerialNumber',
	0xa432: 'LensSpecification',
	0xa433: 'LensMake',
	0xa434: 'LensModel',
	0xa435: 'LensSerialNumber',
};

const GPS_TAGS: Record<number, string> = {
	0x0000: 'GPSVersionID',
	0x0001: 'GPSLatitudeRef',
	0x0002: 'GPSLatitude',
	0x0003: 'GPSLongitudeRef',
	0x0004: 'GPSLongitude',
	0x0005: 'GPSAltitudeRef',
	0x0006: 'GPSAltitude',
	0x0007: 'GPSTimeStamp',
	0x000c: 'GPSSpeedRef',
	0x000d: 'GPSSpeed',
	0x0010: 'GPSImgDirectionRef',
	0x0011: 'GPSImgDirection',
	0x0012: 'GPSMapDatum',
	0x001d: 'GPSDateStamp',
};

const INTEROP_TAGS: Record<number, string> = { 0x0001: 'InteroperabilityIndex', 0x0002: 'InteroperabilityVersion' };

const TAG_NAMES: Record<ExifGroup, Record<number, string>> = {
	Image: IMAGE_TAGS,
	Photo: PHOTO_TAGS,
	GPS: GPS_TAGS,
	Interoperability: INTEROP_TAGS,
};

const ORIENTATION = [
	'',
	'Normal',
	'Mirrored horizontally',
	'Rotated 180°',
	'Mirrored vertically',
	'Mirrored and rotated 90° counter-clockwise',
	'Rotated 90° clockwise',
	'Mirrored and rotated 90° clockwise',
	'Rotated 90° counter-clockwise',
];

/** Byte size of one value of each TIFF field type. */
const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

type Rational = [number, number];
type RawValue = string | number[] | Rational[] | Uint8Array;

export class ExifError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ExifError';
	}
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"

/** Parse a TIFF/EXIF block. Accepts data with or without the "Exif\0\0" prefix. */
export function parseExif(input: Uint8Array, source = 'eXIf chunk'): ExifData {
	let bytes = input;
	if (EXIF_HEADER.every((b, i) => bytes[i] === b)) bytes = bytes.subarray(6);
	if (bytes.length < 8) throw new ExifError('EXIF data is too short');

	const order = String.fromCharCode(bytes[0]!, bytes[1]!);
	if (order !== 'II' && order !== 'MM') throw new ExifError('EXIF data has no TIFF header');
	const le = order === 'II';
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint16(2, le) !== 42) throw new ExifError('EXIF data has a bad TIFF header');

	const entries: ExifEntry[] = [];
	const raw = new Map<string, RawValue>();
	const visited = new Set<number>();

	const readValue = (type: number, count: number, offset: number): RawValue => {
		const size = TYPE_SIZES[type] ?? 1;
		const total = size * count;
		if (offset < 0 || offset + total > bytes.length) throw new ExifError('EXIF value runs past the end');
		switch (type) {
			case 2: {
				let s = '';
				for (let i = 0; i < count; i++) s += String.fromCharCode(bytes[offset + i]!);
				return s.replace(/\0+$/, '');
			}
			case 3:
				return Array.from({ length: count }, (_, i) => view.getUint16(offset + i * 2, le));
			case 8:
				return Array.from({ length: count }, (_, i) => view.getInt16(offset + i * 2, le));
			case 4:
				return Array.from({ length: count }, (_, i) => view.getUint32(offset + i * 4, le));
			case 9:
				return Array.from({ length: count }, (_, i) => view.getInt32(offset + i * 4, le));
			case 5:
			case 10:
				return Array.from({ length: count }, (_, i): Rational => {
					const at = offset + i * 8;
					return type === 5
						? [view.getUint32(at, le), view.getUint32(at + 4, le)]
						: [view.getInt32(at, le), view.getInt32(at + 4, le)];
				});
			case 11:
				return Array.from({ length: count }, (_, i) => view.getFloat32(offset + i * 4, le));
			case 12:
				return Array.from({ length: count }, (_, i) => view.getFloat64(offset + i * 8, le));
			case 6:
				return Array.from({ length: count }, (_, i) => view.getInt8(offset + i));
			default:
				return bytes.slice(offset, offset + total);
		}
	};

	const readIfd = (offset: number, group: ExifGroup) => {
		if (visited.has(offset) || offset < 8 || offset + 2 > bytes.length) return;
		visited.add(offset);
		const count = view.getUint16(offset, le);
		for (let i = 0; i < count; i++) {
			const at = offset + 2 + i * 12;
			if (at + 12 > bytes.length) break;
			const tag = view.getUint16(at, le);
			const type = view.getUint16(at + 2, le);
			const n = view.getUint32(at + 4, le);
			const size = (TYPE_SIZES[type] ?? 1) * n;
			const valueOffset = size <= 4 ? at + 8 : view.getUint32(at + 8, le);

			const pointer = IFD_POINTERS[tag];
			if (pointer && group !== 'GPS') {
				readIfd(view.getUint32(at + 8, le), pointer);
				continue;
			}
			let value: RawValue;
			try {
				value = readValue(type, n, valueOffset);
			} catch {
				continue;
			}
			const name = TAG_NAMES[group][tag] ?? `0x${tag.toString(16).padStart(4, '0')}`;
			raw.set(`${group}:${name}`, value);
			const decoded = typeof value === 'string' ? value : value instanceof Uint8Array ? null : asNumbers(value);
			entries.push({ group, tag, name, value: formatValue(name, value), raw: decoded });
		}
	};

	readIfd(view.getUint32(4, le), 'Image');

	const gps = gpsPosition(raw);
	return { littleEndian: le, entries, gps, source };
}

function ratio([n, d]: Rational): number {
	return d === 0 ? 0 : n / d;
}

function trimNumber(n: number, digits = 4): string {
	return String(Number(n.toFixed(digits)));
}

function asNumbers(value: RawValue): number[] | null {
	if (typeof value === 'string' || value instanceof Uint8Array) return null;
	return (value as (number | Rational)[]).map((v) => (Array.isArray(v) ? ratio(v) : v));
}

function formatValue(name: string, value: RawValue): string {
	if (typeof value === 'string') return value;

	if (value instanceof Uint8Array) {
		if (name === 'UserComment') return decodeUserComment(value);
		if (/Version$/.test(name) && value.length === 4 && value.every((b) => b >= 0x30 && b <= 0x39)) {
			return String.fromCharCode(...value);
		}
		if (name.startsWith('XP')) {
			// Windows "XP" tags are UTF-16LE strings stored as bytes.
			return new TextDecoder('utf-16le').decode(value).replace(/\0+$/, '');
		}
		return `(${value.length} bytes)`;
	}

	if (name.startsWith('XP')) {
		return new TextDecoder('utf-16le').decode(Uint8Array.from(value as number[])).replace(/\0+$/, '');
	}

	const first = value[0];
	if (name === 'ExposureTime' && Array.isArray(first)) {
		const [n, d] = first;
		return n > 0 && d % n === 0 && n !== d ? `1/${d / n} s` : `${trimNumber(ratio(first))} s`;
	}
	if (name === 'FNumber' && Array.isArray(first)) return `f/${trimNumber(ratio(first), 1)}`;
	if (name === 'FocalLength' && Array.isArray(first)) return `${trimNumber(ratio(first), 1)} mm`;
	if (name === 'Orientation' && typeof first === 'number') return ORIENTATION[first] ?? String(first);
	if ((name === 'GPSLatitude' || name === 'GPSLongitude') && value.length === 3) {
		const [deg, min, sec] = asNumbers(value)!;
		return `${deg}° ${min}′ ${trimNumber(sec!, 2)}″`;
	}

	const numbers = asNumbers(value)!;
	return numbers.map((n) => trimNumber(n)).join(', ');
}

function decodeUserComment(value: Uint8Array): string {
	const charset = String.fromCharCode(...value.subarray(0, 8)).replace(/\0+$/, '');
	const body = value.subarray(8);
	let text: string;
	if (charset === 'UNICODE') text = new TextDecoder('utf-16be').decode(body);
	else text = new TextDecoder('utf-8').decode(body);
	return text.replace(/\0+$/, '').trim();
}

function gpsPosition(raw: Map<string, RawValue>): ExifData['gps'] {
	const toDecimal = (key: string, refKey: string, negative: string): number | null => {
		const value = raw.get(key);
		const ref = raw.get(refKey);
		if (!value || typeof ref !== 'string') return null;
		const parts = asNumbers(value);
		if (!parts || parts.length !== 3) return null;
		const decimal = parts[0]! + parts[1]! / 60 + parts[2]! / 3600;
		return ref.toUpperCase() === negative ? -decimal : decimal;
	};
	const latitude = toDecimal('GPS:GPSLatitude', 'GPS:GPSLatitudeRef', 'S');
	const longitude = toDecimal('GPS:GPSLongitude', 'GPS:GPSLongitudeRef', 'W');
	return latitude === null || longitude === null ? undefined : { latitude, longitude };
}

/** Decode the hex payload of an ImageMagick "Raw profile type ..." text chunk. */
export function decodeRawProfile(text: string): Uint8Array {
	const lines = text.split('\n').filter((l) => l.trim().length > 0);
	// lines[0] is the profile name, lines[1] the byte count, the rest hex.
	const length = Number.parseInt(lines[1] ?? '', 10);
	const hex = lines.slice(2).join('').replace(/\s+/g, '');
	if (!Number.isFinite(length) || !/^[0-9a-fA-F]*$/.test(hex) || hex.length < length * 2) {
		throw new ExifError('Malformed raw profile');
	}
	const out = new Uint8Array(length);
	for (let i = 0; i < length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

/** Find and decode the image's EXIF, from an eXIf chunk or an ImageMagick raw profile. */
export function findExif(chunks: PngChunk[], textEntries: TextEntry[]): ExifData | null {
	const exifChunk = chunks.find((c) => c.type === 'eXIf');
	if (exifChunk) return parseExif(exifChunk.data);
	const profile = textEntries.find((e) => /^Raw profile type (exif|APP1)$/i.test(e.keyword));
	if (profile) return parseExif(decodeRawProfile(profile.text), profile.keyword);
	return null;
}
