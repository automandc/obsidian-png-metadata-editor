import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { encodePng, parsePng, PngError, readHeader } from '../../src/png/chunks';
import { fixture } from './helpers';

const FIXTURE_NAMES = ['plain.png', 'text-chunks.png', 'sillytavern-card.png'];

describe('parsePng / encodePng', function () {
	for (const name of FIXTURE_NAMES) {
		it(`round-trips ${name} byte for byte`, function () {
			const original = fixture(name);
			const chunks = parsePng(original);
			assert.deepEqual(encodePng(chunks), original);
		});
	}

	it('reads the image header', function () {
		const header = readHeader(parsePng(fixture('plain.png')));
		assert.equal(header.width, 64);
		assert.equal(header.height, 64);
		assert.equal(header.bitDepth, 8);
		assert.equal(header.colorType, 2);
	});

	it('lists chunks in file order, starting with IHDR and ending with IEND', function () {
		const types = parsePng(fixture('plain.png')).map((c) => c.type);
		assert.equal(types[0], 'IHDR');
		assert.equal(types[types.length - 1], 'IEND');
		assert.ok(types.includes('IDAT'));
	});

	it('accepts an ArrayBuffer', function () {
		const bytes = fixture('plain.png');
		const buffer = new ArrayBuffer(bytes.length);
		new Uint8Array(buffer).set(bytes);
		assert.equal(parsePng(buffer).length, parsePng(bytes).length);
	});
});

describe('parsePng rejects broken files', function () {
	it('rejects a non-PNG file', function () {
		assert.throws(() => parsePng(new TextEncoder().encode('GIF89a not a png')), PngError);
	});

	it('rejects a truncated file', function () {
		const bytes = fixture('plain.png');
		assert.throws(() => parsePng(bytes.subarray(0, bytes.length - 20)), PngError);
	});

	it('rejects a file with a corrupted chunk', function () {
		const bytes = fixture('plain.png').slice();
		bytes[20] = bytes[20]! ^ 0xff; // inside IHDR data
		assert.throws(() => parsePng(bytes), /Checksum mismatch in IHDR/);
	});

	it('rejects a file without IEND', function () {
		const chunks = parsePng(fixture('plain.png')).filter((c) => c.type !== 'IEND');
		assert.throws(() => parsePng(encodePng(chunks)), /Missing IEND/);
	});
});
