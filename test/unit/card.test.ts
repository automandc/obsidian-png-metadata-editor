import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
	CardError,
	decodeCardText,
	encodeCardText,
	hasCard,
	readCard,
	writeCardToEntries,
} from '../../src/card/card';
import { encodePng, parsePng } from '../../src/png/chunks';
import { applyTextEntries, readTextEntries } from '../../src/png/text';
import { fixture, writeOutput } from './helpers';

function load(name: string) {
	const chunks = parsePng(fixture(name));
	return { chunks, entries: readTextEntries(chunks) };
}

interface Json {
	spec?: unknown;
	spec_version?: unknown;
	data?: Record<string, unknown>;
	[key: string]: unknown;
}

function cardJson(entries: ReturnType<typeof readTextEntries>, keyword: string): Json {
	return decodeCardText(entries.find((e) => e.keyword === keyword)!.text);
}

describe('card text encoding', function () {
	it('round-trips Unicode JSON through base64', function () {
		const json = { spec: 'chara_card_v2', data: { name: 'Zoë 🌸 日本' } };
		assert.deepEqual(decodeCardText(encodeCardText(json)), json);
	});

	it('matches how other tools encode cards (base64 of UTF-8 JSON)', function () {
		const json = { name: 'Zoë' };
		assert.equal(encodeCardText(json), Buffer.from(JSON.stringify(json), 'utf8').toString('base64'));
	});

	it('rejects text that is not a card', function () {
		assert.throws(() => decodeCardText('this is not a card'), CardError);
		assert.throws(() => decodeCardText(btoa('[1, 2]')), /not an object/);
	});
});

describe('readCard', function () {
	it('returns null for a PNG without a card', function () {
		const { entries } = load('text-chunks.png');
		assert.equal(hasCard(entries), false);
		assert.equal(readCard(entries), null);
	});

	it('reads a card with both chunks, preferring ccv3', function () {
		const card = readCard(load('sillytavern-card.png').entries)!;
		assert.deepEqual(
			card.chunks.map((c) => [c.keyword, c.format]),
			[
				['ccv3', 'v3'],
				['chara', 'v2'],
			],
		);
		assert.equal(card.fields.name, 'Test Character');
		assert.deepEqual(card.fields.alternate_greetings, ['Hi there.', 'Greetings, traveller.']);
		assert.deepEqual(card.fields.tags, ['test']);
	});

	it('reads a V2-only card with Unicode and a lorebook', function () {
		const card = readCard(load('card-v2-only.png').entries)!;
		assert.deepEqual(
			card.chunks.map((c) => c.keyword),
			['chara'],
		);
		assert.equal(card.fields.name, 'Zoë 🌸');
		assert.equal(card.lorebookEntries, 2);
	});

	it('reads an old V1 card', function () {
		const card = readCard(load('card-v1.png').entries)!;
		assert.equal(card.chunks[0]?.format, 'v1');
		assert.equal(card.fields.name, 'Old Format Character');
		assert.deepEqual(card.fields.alternate_greetings, []);
	});

	it('reports a broken card chunk', function () {
		assert.throws(() => readCard(load('card-broken.png').entries), /"chara" field/);
	});
});

describe('writeCardToEntries', function () {
	const now = new Date('2026-10-12T00:00:00Z');

	it('updates both chunks and keeps them in agreement', function () {
		const { chunks, entries } = load('sillytavern-card.png');
		const card = readCard(entries)!;
		const fields = {
			...card.fields,
			name: 'Renamed 名前',
			alternate_greetings: ['Only one now.'],
			tags: ['test', 'edited'],
		};
		writeCardToEntries(entries, card, fields, now);

		const v3 = cardJson(entries, 'ccv3');
		const v2 = cardJson(entries, 'chara');
		assert.equal(v3.spec, 'chara_card_v3');
		assert.equal(v2.spec, 'chara_card_v2');
		for (const json of [v3, v2]) {
			assert.equal(json.data!.name, 'Renamed 名前');
			assert.deepEqual(json.data!.alternate_greetings, ['Only one now.']);
			assert.deepEqual(json.data!.tags, ['test', 'edited']);
			assert.equal(json.data!.description, card.fields.description);
		}
		assert.equal(v3.data!.modification_date, Math.floor(now.getTime() / 1000));
		assert.equal(v2.data!.modification_date, undefined);
		// V3-only fields survive.
		assert.deepEqual(v3.data!.group_only_greetings, []);

		const out = encodePng(applyTextEntries(chunks, entries));
		writeOutput('edited-card-both.png', out, {
			chara: entries.find((e) => e.keyword === 'chara')!.text,
			ccv3: entries.find((e) => e.keyword === 'ccv3')!.text,
		});
	});

	it('keeps lorebooks, extensions and unknown fields', function () {
		const { entries } = load('card-v2-only.png');
		const before = cardJson(entries, 'chara');
		const card = readCard(entries)!;
		writeCardToEntries(entries, card, { ...card.fields, personality: 'Changed' }, now);

		const after = cardJson(entries, 'chara');
		assert.equal(after.data!.personality, 'Changed');
		assert.deepEqual(after.data!.character_book, before.data!.character_book);
		assert.deepEqual(after.data!.extensions, before.data!.extensions);
		assert.equal(after.spec_version, '2.0');
		assert.equal(entries.length, 1, 'no ccv3 chunk is added');
	});

	it('keeps a V1 card in V1 shape', function () {
		const { entries } = load('card-v1.png');
		const card = readCard(entries)!;
		writeCardToEntries(entries, card, { ...card.fields, scenario: 'New scenario' }, now);
		const after = cardJson(entries, 'chara');
		assert.equal(after.spec, undefined);
		assert.equal(after.data, undefined);
		assert.equal(after.scenario, 'New scenario');
		assert.equal(after.name, 'Old Format Character');
	});

	it('marks only card entries dirty', function () {
		const { entries } = load('sillytavern-card.png');
		const card = readCard(entries)!;
		writeCardToEntries(entries, card, card.fields, now);
		assert.ok(entries.every((e) => e.dirty));
		const { entries: plain } = load('text-chunks.png');
		assert.ok(plain.every((e) => !e.dirty));
	});
});
