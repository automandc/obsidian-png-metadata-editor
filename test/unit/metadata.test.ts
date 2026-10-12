import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { describe, it } from 'mocha';
import { parsePng } from '../../src/png/chunks';
import { decodeRawProfile, ExifData, findExif, parseExif } from '../../src/png/exif';
import { readInfoRows } from '../../src/png/info';
import { readTextEntries } from '../../src/png/text';
import { parseXmp, XMP_KEYWORD } from '../../src/png/xmp';
import { FIXTURES, fixture } from './helpers';

function exifOf(name: string): ExifData {
	const chunks = parsePng(fixture(name));
	const exif = findExif(chunks, readTextEntries(chunks));
	assert.ok(exif, `${name} has EXIF`);
	return exif;
}

function valueOf(exif: ExifData, group: string, name: string): string | undefined {
	return exif.entries.find((e) => e.group === group && e.name === name)?.value;
}

describe('EXIF', function () {
	it('agrees with Pillow on every tag in photo.png', function () {
		const reference = JSON.parse(readFileSync(join(FIXTURES, 'photo.exif.json'), 'utf8')) as Record<
			string,
			string | number | number[]
		>;
		const exif = exifOf('photo.png');
		for (const [key, expected] of Object.entries(reference)) {
			const [group, name] = key.split(':');
			const entry = exif.entries.find((e) => e.group === group && e.name === name);
			assert.ok(entry, `missing ${key}`);
			const actual = Array.isArray(entry.raw) && !Array.isArray(expected) ? entry.raw[0] : entry.raw;
			if (typeof expected === 'string') {
				assert.equal(actual, expected, key);
			} else {
				const want = ([] as number[]).concat(expected);
				const got = ([] as number[]).concat(actual as number | number[]);
				assert.deepEqual(
					got.map((n) => Number(n.toFixed(6))),
					want.map((n) => Number(n.toFixed(6))),
					key,
				);
			}
		}
	});

	it('formats camera values for people', function () {
		const exif = exifOf('photo.png');
		assert.equal(exif.source, 'eXIf chunk');
		assert.equal(exif.littleEndian, false);
		assert.equal(valueOf(exif, 'Photo', 'ExposureTime'), '1/250 s');
		assert.equal(valueOf(exif, 'Photo', 'FNumber'), 'f/2.8');
		assert.equal(valueOf(exif, 'Photo', 'FocalLength'), '50 mm');
		assert.equal(valueOf(exif, 'Image', 'Orientation'), 'Normal');
		assert.equal(valueOf(exif, 'GPS', 'GPSLatitude'), '40° 42′ 46.08″');
	});

	it('works out the GPS position in decimal degrees', function () {
		const { gps } = exifOf('photo.png');
		assert.ok(gps);
		assert.equal(gps.latitude.toFixed(4), '40.7128');
		assert.equal(gps.longitude.toFixed(4), '-74.0060');
	});

	it('reads little-endian EXIF the same way', function () {
		const le = exifOf('photo-le.png');
		const be = exifOf('photo.png');
		assert.equal(le.littleEndian, true);
		assert.deepEqual(
			le.entries.map((e) => [e.group, e.name, e.value]),
			be.entries.map((e) => [e.group, e.name, e.value]),
		);
	});

	it('reads EXIF from an ImageMagick raw profile text chunk', function () {
		const exif = exifOf('imagemagick-exif.png');
		assert.equal(exif.source, 'Raw profile type exif');
		assert.equal(valueOf(exif, 'Image', 'Make'), 'Canon');
		assert.equal(valueOf(exif, 'Photo', 'ISOSpeedRatings'), '200');
	});

	it('returns null for a PNG without EXIF', function () {
		const chunks = parsePng(fixture('text-chunks.png'));
		assert.equal(findExif(chunks, readTextEntries(chunks)), null);
	});

	it('rejects data that is not EXIF', function () {
		assert.throws(() => parseExif(new TextEncoder().encode('definitely not tiff')), /TIFF header/);
		assert.throws(() => decodeRawProfile('\nexif\n  100\nzz'), /Malformed/);
	});

	it('survives a corrupt IFD offset without crashing', function () {
		// Valid big-endian TIFF header pointing at an IFD far past the end.
		const bytes = Uint8Array.of(0x4d, 0x4d, 0, 42, 0, 0, 0xff, 0xff);
		assert.deepEqual(parseExif(bytes).entries, []);
	});
});

describe('PNG info chunks', function () {
	it('decodes resolution, time, gamma and color profile', function () {
		const rows = readInfoRows(parsePng(fixture('photo.png')));
		const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
		assert.equal(byLabel.Resolution, '300 dpi');
		assert.equal(byLabel['Last modified'], '2026-10-11 14:30:00 UTC');
		assert.equal(byLabel.Gamma, '0.45455');
		assert.match(byLabel['Color profile'] ?? '', /embedded/);
	});

	it('finds nothing in a bare PNG', function () {
		assert.deepEqual(readInfoRows(parsePng(fixture('plain.png'))), []);
	});
});

describe('XMP', function () {
	it('lists Dublin Core and XMP properties with friendly labels', function () {
		const entries = readTextEntries(parsePng(fixture('photo.png')));
		const xmp = entries.find((e) => e.keyword === XMP_KEYWORD);
		assert.ok(xmp);
		// xmldom stands in for the browser's DOMParser under Node.
		const props = parseXmp(xmp.text, new DOMParser() as unknown as Parameters<typeof parseXmp>[1]);
		const byLabel = Object.fromEntries(props.map((p) => [p.label, p.value]));
		assert.equal(byLabel.Title, 'Gradient study');
		assert.equal(byLabel.Creator, 'Test Photographer');
		assert.equal(byLabel.Keywords, 'test, gradient');
		assert.equal(byLabel['Creator tool'], 'png-metadata-editor tests');
		assert.equal(byLabel.Created, '2026-10-11T14:29:59');
	});
});
