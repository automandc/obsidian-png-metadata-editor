import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = fileURLToPath(new URL('..', import.meta.url));

export const FIXTURES = join(TEST_DIR, 'fixtures');
/** Files written here are checked by scripts/validate-output.py with Pillow. */
export const OUTPUT = join(TEST_DIR, 'output');

export function fixture(name: string): Uint8Array {
	return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

/** Save a file for independent validation, with the text Pillow should find in it. */
export function writeOutput(name: string, bytes: Uint8Array, expectedText: Record<string, string>) {
	mkdirSync(OUTPUT, { recursive: true });
	writeFileSync(join(OUTPUT, name), bytes);
	writeFileSync(join(OUTPUT, `${name}.expected.json`), JSON.stringify(expectedText, null, '\t'));
}
