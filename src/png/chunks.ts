/**
 * Low-level PNG container handling: split a file into chunks and join them
 * back together. Chunk payloads are kept as raw bytes, so a parse followed by
 * an encode reproduces the original file exactly.
 */

export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export interface PngChunk {
	/** Four-character chunk type, e.g. "IHDR" or "tEXt". */
	type: string;
	data: Uint8Array;
}

export class PngError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PngError';
	}
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC-32 over the chunk type and data, as the PNG spec defines it. */
export function crc32(type: Uint8Array, data: Uint8Array): number {
	let c = 0xffffffff;
	for (const bytes of [type, data]) {
		for (let i = 0; i < bytes.length; i++) {
			c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
		}
	}
	return (c ^ 0xffffffff) >>> 0;
}

function typeBytes(type: string): Uint8Array {
	if (!/^[A-Za-z]{4}$/.test(type)) {
		throw new PngError(`Invalid chunk type "${type}"`);
	}
	return Uint8Array.from(type, (ch) => ch.charCodeAt(0));
}

export function isPng(bytes: Uint8Array): boolean {
	return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * Split a PNG file into its chunks. Throws PngError if the signature, a
 * length, or a checksum is wrong, or if IHDR/IEND are missing.
 */
export function parsePng(input: Uint8Array | ArrayBuffer): PngChunk[] {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	if (!isPng(bytes)) {
		throw new PngError('Not a PNG file (bad signature)');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks: PngChunk[] = [];
	let offset = PNG_SIGNATURE.length;

	while (offset < bytes.length) {
		if (offset + 12 > bytes.length) {
			throw new PngError(`Truncated chunk header at byte ${offset}`);
		}
		const length = view.getUint32(offset);
		const typeArr = bytes.subarray(offset + 4, offset + 8);
		const type = String.fromCharCode(...typeArr);
		const dataStart = offset + 8;
		const dataEnd = dataStart + length;
		if (dataEnd + 4 > bytes.length) {
			throw new PngError(`Chunk ${type} at byte ${offset} runs past the end of the file`);
		}
		const data = bytes.slice(dataStart, dataEnd);
		const storedCrc = view.getUint32(dataEnd);
		if (crc32(typeArr, data) !== storedCrc) {
			throw new PngError(`Checksum mismatch in ${type} chunk at byte ${offset}`);
		}
		chunks.push({ type, data });
		offset = dataEnd + 4;
		if (type === 'IEND') break;
	}

	if (chunks[0]?.type !== 'IHDR') {
		throw new PngError('First chunk is not IHDR');
	}
	if (chunks[chunks.length - 1]?.type !== 'IEND') {
		throw new PngError('Missing IEND chunk');
	}
	return chunks;
}

/** Join chunks into a PNG file, computing lengths and checksums. */
export function encodePng(chunks: PngChunk[]): Uint8Array {
	const total = chunks.reduce((sum, c) => sum + 12 + c.data.length, PNG_SIGNATURE.length);
	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);
	out.set(PNG_SIGNATURE, 0);
	let offset = PNG_SIGNATURE.length;
	for (const chunk of chunks) {
		const type = typeBytes(chunk.type);
		view.setUint32(offset, chunk.data.length);
		out.set(type, offset + 4);
		out.set(chunk.data, offset + 8);
		view.setUint32(offset + 8 + chunk.data.length, crc32(type, chunk.data));
		offset += 12 + chunk.data.length;
	}
	return out;
}

export interface PngHeader {
	width: number;
	height: number;
	bitDepth: number;
	colorType: number;
	interlaced: boolean;
}

export function readHeader(chunks: PngChunk[]): PngHeader {
	const ihdr = chunks[0];
	if (ihdr?.type !== 'IHDR' || ihdr.data.length < 13) {
		throw new PngError('Missing or short IHDR chunk');
	}
	const view = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
	return {
		width: view.getUint32(0),
		height: view.getUint32(4),
		bitDepth: ihdr.data[8]!,
		colorType: ihdr.data[9]!,
		interlaced: ihdr.data[12] === 1,
	};
}
