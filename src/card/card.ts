/**
 * SillyTavern character cards. A card is JSON, base64-encoded and stored in a
 * PNG text chunk: "chara" holds the V1/V2 format and "ccv3" the V3 format.
 * Newer SillyTavern versions write both and read "ccv3" first, so edits are
 * applied to every card chunk in the file to keep them in agreement.
 */
import type { EditableTextEntry } from '../png/text';

export const CARD_KEYWORDS = ['ccv3', 'chara'] as const;
export type CardKeyword = (typeof CARD_KEYWORDS)[number];
export type CardFormat = 'v1' | 'v2' | 'v3';

/** The card fields the form edits. Everything else in the JSON is kept as is. */
export interface CardFields {
	name: string;
	description: string;
	personality: string;
	scenario: string;
	first_mes: string;
	mes_example: string;
	alternate_greetings: string[];
	system_prompt: string;
	post_history_instructions: string;
	creator_notes: string;
	tags: string[];
	creator: string;
	character_version: string;
}

export const STRING_FIELDS = [
	'name',
	'description',
	'personality',
	'scenario',
	'first_mes',
	'mes_example',
	'system_prompt',
	'post_history_instructions',
	'creator_notes',
	'creator',
	'character_version',
] as const;

type Json = Record<string, unknown>;

export interface CardChunk {
	keyword: CardKeyword;
	format: CardFormat;
	json: Json;
}

export interface Card {
	/** Card chunks found in the file, preferred (ccv3) first. */
	chunks: CardChunk[];
	fields: CardFields;
	/** Number of lorebook entries, which this editor keeps but does not edit yet. */
	lorebookEntries: number;
}

export class CardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CardError';
	}
}

export function isCardKeyword(keyword: string): keyword is CardKeyword {
	return (CARD_KEYWORDS as readonly string[]).includes(keyword);
}

export function hasCard(entries: EditableTextEntry[]): boolean {
	return entries.some((e) => isCardKeyword(e.keyword));
}

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeCardText(text: string): Json {
	let json: unknown;
	try {
		const binary = atob(text.trim());
		const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
		json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		throw new CardError('Not valid base64-encoded JSON');
	}
	if (!isObject(json)) throw new CardError('Card JSON is not an object');
	return json;
}

export function encodeCardText(json: Json): string {
	const bytes = new TextEncoder().encode(JSON.stringify(json));
	let binary = '';
	const step = 0x8000;
	for (let i = 0; i < bytes.length; i += step) {
		binary += String.fromCharCode(...bytes.subarray(i, i + step));
	}
	return btoa(binary);
}

export function detectFormat(json: Json): CardFormat {
	if (json.spec === 'chara_card_v3') return 'v3';
	if (json.spec === 'chara_card_v2' || isObject(json.data)) return 'v2';
	return 'v1';
}

/** The object holding the card fields: the top level for V1, `data` otherwise. */
function fieldsObject(chunk: CardChunk): Json {
	if (chunk.format === 'v1') return chunk.json;
	return isObject(chunk.json.data) ? chunk.json.data : {};
}

function str(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function strList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function readCardFields(chunk: CardChunk): CardFields {
	const data = fieldsObject(chunk);
	const fields = {
		alternate_greetings: strList(data.alternate_greetings),
		tags: strList(data.tags),
	} as CardFields;
	for (const key of STRING_FIELDS) fields[key] = str(data[key]);
	return fields;
}

/**
 * Read the card from a PNG's text entries. Returns null when the file has no
 * card chunk; throws CardError when a card chunk cannot be decoded.
 */
export function readCard(entries: EditableTextEntry[]): Card | null {
	const chunks: CardChunk[] = [];
	for (const keyword of CARD_KEYWORDS) {
		const entry = entries.find((e) => e.keyword === keyword);
		if (!entry) continue;
		let json: Json;
		try {
			json = decodeCardText(entry.text);
		} catch (e) {
			throw new CardError(`The "${keyword}" field: ${e instanceof Error ? e.message : String(e)}`);
		}
		chunks.push({ keyword, format: detectFormat(json), json });
	}
	const preferred = chunks[0];
	if (!preferred) return null;

	const book = fieldsObject(preferred).character_book;
	const lorebookEntries = isObject(book) && Array.isArray(book.entries) ? book.entries.length : 0;
	return { chunks, fields: readCardFields(preferred), lorebookEntries };
}

/** A copy of the chunk's JSON with the form fields written into it. */
export function applyCardFields(chunk: CardChunk, fields: CardFields, now = new Date()): Json {
	const json = structuredClone(chunk.json);
	let data: Json;
	if (chunk.format === 'v1') {
		data = json;
	} else {
		if (!isObject(json.data)) json.data = {};
		data = json.data as Json;
	}
	for (const key of STRING_FIELDS) data[key] = fields[key];
	data.alternate_greetings = [...fields.alternate_greetings];
	data.tags = [...fields.tags];
	if (chunk.format === 'v3') {
		data.modification_date = Math.floor(now.getTime() / 1000);
	}
	return json;
}

/**
 * Write the form fields into every card chunk among the entries, marking the
 * changed entries dirty so they are saved.
 */
export function writeCardToEntries(
	entries: EditableTextEntry[],
	card: Card,
	fields: CardFields,
	now = new Date(),
) {
	for (const chunk of card.chunks) {
		const entry = entries.find((e) => e.keyword === chunk.keyword);
		if (!entry) continue;
		entry.text = encodeCardText(applyCardFields(chunk, fields, now));
		entry.dirty = true;
	}
}
