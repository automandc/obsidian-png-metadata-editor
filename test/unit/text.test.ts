import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { encodePng, parsePng, PngChunk } from '../../src/png/chunks';
import {
	applyTextEntries,
	decodeTextChunk,
	EditableTextEntry,
	encodeTextChunk,
	readTextEntries,
	TextEntry,
	validateTextEntry,
} from '../../src/png/text';
import { fixture, writeOutput } from './helpers';

function nonText(chunks: PngChunk[]) {
	return chunks.filter((c) => !['tEXt', 'zTXt', 'iTXt'].includes(c.type));
}

describe('readTextEntries', function () {
	it('decodes tEXt, zTXt and both kinds of iTXt', function () {
		const entries = readTextEntries(parsePng(fixture('text-chunks.png')));
		const byKey = Object.fromEntries(entries.map((e) => [e.keyword, e]));

		assert.equal(byKey.Title?.type, 'tEXt');
		assert.equal(byKey.Title?.text, 'Sample image');
		assert.equal(byKey.Comment?.type, 'zTXt');
		assert.equal(byKey.Comment?.text, 'Stored compressed in zTXt');
		assert.equal(byKey.Description?.type, 'iTXt');
		assert.equal(byKey.Description?.text, 'Unicode text: café, naïve, 日本語');
		assert.equal(byKey.Description?.languageTag, 'en');
		assert.equal(byKey.Description?.translatedKeyword, 'Beschreibung');
		assert.equal(byKey.Compressed?.compressed, true);
		assert.equal(byKey.Compressed?.text, 'Compressed international text: ünïcödé');
	});

	it('finds the SillyTavern chara and ccv3 chunks', function () {
		const entries = readTextEntries(parsePng(fixture('sillytavern-card.png')));
		const chara = entries.find((e) => e.keyword === 'chara');
		assert.ok(chara);
		const card = JSON.parse(Buffer.from(chara.text, 'base64').toString('utf8')) as {
			spec: string;
			data: { name: string };
		};
		assert.equal(card.spec, 'chara_card_v2');
		assert.equal(card.data.name, 'Test Character');
		assert.ok(entries.some((e) => e.keyword === 'ccv3'));
	});

	it('returns nothing for a PNG without text', function () {
		assert.deepEqual(readTextEntries(parsePng(fixture('plain.png'))), []);
	});
});

describe('encodeTextChunk', function () {
	const samples: TextEntry[] = [
		{ type: 'tEXt', keyword: 'Author', text: 'Ünïcödé-free Latin-1 ©' },
		{ type: 'zTXt', keyword: 'Notes', text: 'x'.repeat(1000) },
		{ type: 'iTXt', keyword: 'Intl', text: '日本語 ✓', languageTag: 'ja', translatedKeyword: '国際' },
		{ type: 'iTXt', keyword: 'IntlZ', text: 'emoji 🎉 '.repeat(50), compressed: true },
	];
	for (const entry of samples) {
		it(`round-trips a ${entry.type}${entry.compressed ? ' (compressed)' : ''} entry`, function () {
			const decoded = decodeTextChunk(encodeTextChunk(entry));
			assert.equal(decoded.type, entry.type);
			assert.equal(decoded.keyword, entry.keyword);
			assert.equal(decoded.text, entry.text);
		});
	}

	it('refuses non-Latin-1 text in tEXt', function () {
		assert.throws(() => encodeTextChunk({ type: 'tEXt', keyword: 'K', text: '日本' }), /Latin-1/);
	});
});

describe('validateTextEntry', function () {
	const base: TextEntry = { type: 'tEXt', keyword: 'Title', text: 'ok' };
	it('accepts a normal entry', function () {
		assert.equal(validateTextEntry(base), null);
	});
	for (const keyword of ['', 'x'.repeat(80), ' lead', 'trail ', 'two  spaces', 'tab\there']) {
		it(`rejects keyword ${JSON.stringify(keyword)}`, function () {
			assert.notEqual(validateTextEntry({ ...base, keyword }), null);
		});
	}
});

describe('applyTextEntries', function () {
	it('changes nothing when no entry is edited', function () {
		const original = fixture('text-chunks.png');
		const chunks = parsePng(original);
		const rebuilt = encodePng(applyTextEntries(chunks, readTextEntries(chunks)));
		assert.deepEqual(rebuilt, original);
	});

	it('edits a value in place without touching image data', function () {
		const chunks = parsePng(fixture('text-chunks.png'));
		const entries = readTextEntries(chunks);
		const title = entries.find((e) => e.keyword === 'Title')!;
		Object.assign(title, { text: 'Edited title', dirty: true });

		const out = encodePng(applyTextEntries(chunks, entries));
		const reparsed = parsePng(out);
		assert.deepEqual(nonText(reparsed), nonText(chunks));
		assert.deepEqual(
			reparsed.map((c) => c.type),
			chunks.map((c) => c.type),
		);
		const after = readTextEntries(reparsed).find((e) => e.keyword === 'Title');
		assert.equal(after?.text, 'Edited title');

		writeOutput('edited-title.png', out, {
			Title: 'Edited title',
			Comment: 'Stored compressed in zTXt',
			Description: 'Unicode text: café, naïve, 日本語',
			Compressed: 'Compressed international text: ünïcödé',
		});
	});

	it('adds new entries before IEND and removes deleted ones', function () {
		const chunks = parsePng(fixture('text-chunks.png'));
		const entries: EditableTextEntry[] = readTextEntries(chunks).filter((e) => e.keyword !== 'Comment');
		entries.push({ type: 'iTXt', keyword: 'Added', text: 'Neu hinzugefügt ✓', dirty: true });

		const out = encodePng(applyTextEntries(chunks, entries));
		const reparsed = parsePng(out);
		const types = reparsed.map((c) => c.type);
		assert.equal(types[types.length - 2], 'iTXt');
		assert.ok(!types.includes('zTXt'));
		const keys = readTextEntries(reparsed).map((e) => e.keyword);
		assert.deepEqual(keys.sort(), ['Added', 'Compressed', 'Description', 'Title']);

		writeOutput('added-and-removed.png', out, {
			Title: 'Sample image',
			Description: 'Unicode text: café, naïve, 日本語',
			Compressed: 'Compressed international text: ünïcödé',
			Added: 'Neu hinzugefügt ✓',
		});
	});

	it('can change an entry type', function () {
		const chunks = parsePng(fixture('text-chunks.png'));
		const entries = readTextEntries(chunks);
		const title = entries.find((e) => e.keyword === 'Title')!;
		Object.assign(title, { type: 'iTXt', text: 'Now with ünïcödé ✓', dirty: true });

		const out = encodePng(applyTextEntries(chunks, entries));
		const after = readTextEntries(parsePng(out)).find((e) => e.keyword === 'Title');
		assert.equal(after?.type, 'iTXt');
		assert.equal(after?.text, 'Now with ünïcödé ✓');
	});

	it('edits a SillyTavern card without corrupting it', function () {
		const chunks = parsePng(fixture('sillytavern-card.png'));
		const entries = readTextEntries(chunks);
		const chara = entries.find((e) => e.keyword === 'chara')!;
		const card = JSON.parse(Buffer.from(chara.text, 'base64').toString('utf8')) as {
			data: { name: string };
		};
		card.data.name = 'Renamed Character';
		const newText = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
		Object.assign(chara, { text: newText, dirty: true });

		const out = encodePng(applyTextEntries(chunks, entries));
		const ccv3 = entries.find((e) => e.keyword === 'ccv3')!.text;
		writeOutput('edited-card.png', out, { chara: newText, ccv3 });
	});
});
