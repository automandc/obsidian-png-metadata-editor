/**
 * PNG text chunks (tEXt, zTXt, iTXt): decoding them into editable entries and
 * writing edited entries back into a chunk list.
 */
import { unzlibSync, zlibSync } from 'fflate';
import { PngChunk, PngError } from './chunks';

export type TextChunkType = 'tEXt' | 'zTXt' | 'iTXt';

export const TEXT_CHUNK_TYPES: readonly TextChunkType[] = ['tEXt', 'zTXt', 'iTXt'];

export interface TextEntry {
	type: TextChunkType;
	keyword: string;
	text: string;
	/** iTXt only: whether the text is zlib-compressed. */
	compressed?: boolean;
	/** iTXt only. */
	languageTag?: string;
	/** iTXt only. */
	translatedKeyword?: string;
}

export function isTextChunkType(type: string): type is TextChunkType {
	return (TEXT_CHUNK_TYPES as readonly string[]).includes(type);
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
const utf8Encoder = new TextEncoder();

function latin1Decode(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
	return s;
}

function latin1Encode(text: string): Uint8Array {
	const out = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code > 0xff) {
			throw new PngError(`Character "${text[i]}" cannot be stored in a Latin-1 text chunk`);
		}
		out[i] = code;
	}
	return out;
}

export function isLatin1(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) > 0xff) return false;
	}
	return true;
}

/** Keywords allow printable Latin-1 only: codes 32-126 and 161-255. */
function isPrintableLatin1(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code < 32 || (code > 126 && code < 161) || code > 255) return false;
	}
	return true;
}

function indexOfNull(bytes: Uint8Array, from: number): number {
	const i = bytes.indexOf(0, from);
	if (i < 0) throw new PngError('Text chunk is missing a null separator');
	return i;
}

export function decodeTextChunk(chunk: PngChunk): TextEntry {
	const { data } = chunk;
	const keyEnd = indexOfNull(data, 0);
	const keyword = latin1Decode(data.subarray(0, keyEnd));

	switch (chunk.type) {
		case 'tEXt':
			return { type: 'tEXt', keyword, text: latin1Decode(data.subarray(keyEnd + 1)) };
		case 'zTXt': {
			const method = data[keyEnd + 1];
			if (method !== 0) throw new PngError(`Unknown zTXt compression method ${method}`);
			const text = latin1Decode(unzlibSync(data.subarray(keyEnd + 2)));
			return { type: 'zTXt', keyword, text };
		}
		case 'iTXt': {
			const compressed = data[keyEnd + 1] === 1;
			const method = data[keyEnd + 2];
			if (compressed && method !== 0) {
				throw new PngError(`Unknown iTXt compression method ${method}`);
			}
			const langEnd = indexOfNull(data, keyEnd + 3);
			const transEnd = indexOfNull(data, langEnd + 1);
			const raw = data.subarray(transEnd + 1);
			return {
				type: 'iTXt',
				keyword,
				compressed,
				languageTag: latin1Decode(data.subarray(keyEnd + 3, langEnd)),
				translatedKeyword: utf8Decoder.decode(data.subarray(langEnd + 1, transEnd)),
				text: utf8Decoder.decode(compressed ? unzlibSync(raw) : raw),
			};
		}
		default:
			throw new PngError(`${chunk.type} is not a text chunk`);
	}
}

/** Returns a human-readable problem with the entry, or null if it can be written. */
export function validateTextEntry(entry: TextEntry): string | null {
	const { keyword } = entry;
	if (keyword.length < 1 || keyword.length > 79) {
		return 'Keyword must be 1 to 79 characters long';
	}
	if (!isPrintableLatin1(keyword)) {
		return 'Keyword may only contain printable Latin-1 characters';
	}
	if (keyword !== keyword.trim() || keyword.includes('  ')) {
		return 'Keyword may not have leading, trailing or repeated spaces';
	}
	if (entry.type !== 'iTXt' && !isLatin1(entry.text)) {
		return `${entry.type} can only hold Latin-1 text; use iTXt for other characters`;
	}
	if (entry.type === 'iTXt' && entry.languageTag && !/^[A-Za-z0-9-]*$/.test(entry.languageTag)) {
		return 'Language tag may only contain letters, digits and hyphens';
	}
	return null;
}

export function encodeTextChunk(entry: TextEntry): PngChunk {
	const problem = validateTextEntry(entry);
	if (problem) throw new PngError(`${entry.keyword || '(empty keyword)'}: ${problem}`);

	const keyword = latin1Encode(entry.keyword);
	let parts: Uint8Array[];
	switch (entry.type) {
		case 'tEXt':
			parts = [keyword, Uint8Array.of(0), latin1Encode(entry.text)];
			break;
		case 'zTXt':
			parts = [keyword, Uint8Array.of(0, 0), zlibSync(latin1Encode(entry.text))];
			break;
		case 'iTXt': {
			const text = utf8Encoder.encode(entry.text);
			parts = [
				keyword,
				Uint8Array.of(0, entry.compressed ? 1 : 0, 0),
				latin1Encode(entry.languageTag ?? ''),
				Uint8Array.of(0),
				utf8Encoder.encode(entry.translatedKeyword ?? ''),
				Uint8Array.of(0),
				entry.compressed ? zlibSync(text) : text,
			];
			break;
		}
	}
	const length = parts.reduce((n, p) => n + p.length, 0);
	const data = new Uint8Array(length);
	let offset = 0;
	for (const p of parts) {
		data.set(p, offset);
		offset += p.length;
	}
	return { type: entry.type, data };
}

/** A text entry together with where it came from in the file. */
export interface EditableTextEntry extends TextEntry {
	/** Index of the source chunk in the parsed chunk list; undefined for new entries. */
	sourceIndex?: number;
	/** False until the entry is changed, so untouched chunks are written back byte for byte. */
	dirty: boolean;
}

export function readTextEntries(chunks: PngChunk[]): EditableTextEntry[] {
	const entries: EditableTextEntry[] = [];
	chunks.forEach((chunk, index) => {
		if (isTextChunkType(chunk.type)) {
			entries.push({ ...decodeTextChunk(chunk), sourceIndex: index, dirty: false });
		}
	});
	return entries;
}

/**
 * Rebuild the chunk list with the given text entries. Text chunks keep their
 * original position; entries that were removed are dropped; new entries go
 * just before IEND. Non-text chunks are untouched.
 */
export function applyTextEntries(chunks: PngChunk[], entries: EditableTextEntry[]): PngChunk[] {
	const bySource = new Map<number, EditableTextEntry>();
	const added: EditableTextEntry[] = [];
	for (const entry of entries) {
		if (entry.sourceIndex === undefined) added.push(entry);
		else bySource.set(entry.sourceIndex, entry);
	}

	const out: PngChunk[] = [];
	chunks.forEach((chunk, index) => {
		if (chunk.type === 'IEND') {
			out.push(...added.map(encodeTextChunk));
		}
		if (!isTextChunkType(chunk.type)) {
			out.push(chunk);
			return;
		}
		const entry = bySource.get(index);
		if (!entry) return;
		out.push(entry.dirty ? encodeTextChunk(entry) : chunk);
	});
	return out;
}
