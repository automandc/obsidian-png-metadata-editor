import { setIcon } from 'obsidian';
import { Card, CardFields } from '../card/card';

type TextField = Exclude<keyof CardFields, 'alternate_greetings' | 'tags'>;

interface FieldSpec {
	key: TextField;
	label: string;
	multiline?: boolean;
	rows?: number;
}

const GROUPS: { title: string; fields: (FieldSpec | 'greetings' | 'tags')[] }[] = [
	{
		title: 'Basics',
		fields: [
			{ key: 'name', label: 'Name' },
			{ key: 'creator', label: 'Creator' },
			{ key: 'character_version', label: 'Version' },
			'tags',
		],
	},
	{
		title: 'Character',
		fields: [
			{ key: 'description', label: 'Description', multiline: true, rows: 8 },
			{ key: 'personality', label: 'Personality', multiline: true, rows: 3 },
			{ key: 'scenario', label: 'Scenario', multiline: true, rows: 3 },
		],
	},
	{
		title: 'Greetings',
		fields: [{ key: 'first_mes', label: 'First message', multiline: true, rows: 5 }, 'greetings'],
	},
	{
		title: 'Examples and prompts',
		fields: [
			{ key: 'mes_example', label: 'Example messages', multiline: true, rows: 6 },
			{ key: 'system_prompt', label: 'System prompt', multiline: true, rows: 3 },
			{ key: 'post_history_instructions', label: 'Post-history instructions', multiline: true, rows: 3 },
			{ key: 'creator_notes', label: 'Creator notes', multiline: true, rows: 3 },
		],
	},
];

const FORMAT_LABELS = { v1: 'V1', v2: 'V2', v3: 'V3' };

/**
 * Render an editable form for a SillyTavern card. `onChange` receives the full
 * set of fields after every edit.
 */
export function renderCardForm(
	container: HTMLElement,
	card: Card,
	onChange: (fields: CardFields) => void,
) {
	const fields: CardFields = {
		...card.fields,
		alternate_greetings: [...card.fields.alternate_greetings],
		tags: [...card.fields.tags],
	};
	const changed = () => onChange(fields);

	const form = container.createDiv({ cls: 'png-card-form' });

	const formats = card.chunks.map((c) => `${FORMAT_LABELS[c.format]} (${c.keyword})`).join(' and ');
	let info = `SillyTavern character card, stored as ${formats}.`;
	if (card.chunks.length > 1) info += ' Edits are saved to both.';
	if (card.lorebookEntries > 0) {
		info += ` Its lorebook (${card.lorebookEntries} entr${card.lorebookEntries === 1 ? 'y' : 'ies'}) is kept but can't be edited here yet.`;
	}
	form.createDiv({ cls: 'png-card-info', text: info });

	for (const group of GROUPS) {
		const groupEl = form.createDiv({ cls: 'png-card-group' });
		groupEl.createEl('h5', { text: group.title });
		for (const spec of group.fields) {
			if (spec === 'greetings') renderGreetings(groupEl, fields, changed);
			else if (spec === 'tags') renderTags(groupEl, fields, changed);
			else renderTextField(groupEl, spec, fields, changed);
		}
	}
}

function fieldRow(parent: HTMLElement, label: string, key: string): HTMLElement {
	const row = parent.createDiv({ cls: 'png-card-field', attr: { 'data-field': key } });
	row.createEl('label', { text: label });
	return row;
}

function renderTextField(parent: HTMLElement, spec: FieldSpec, fields: CardFields, changed: () => void) {
	const row = fieldRow(parent, spec.label, spec.key);
	const input = spec.multiline
		? row.createEl('textarea', { attr: { rows: String(spec.rows ?? 3) } })
		: row.createEl('input', { attr: { type: 'text' } });
	input.value = fields[spec.key];
	input.setAttr('aria-label', spec.label);
	input.addEventListener('input', () => {
		fields[spec.key] = input.value;
		changed();
	});
}

function renderTags(parent: HTMLElement, fields: CardFields, changed: () => void) {
	const row = fieldRow(parent, 'Tags', 'tags');
	const input = row.createEl('input', {
		attr: { type: 'text', placeholder: 'Comma-separated', 'aria-label': 'Tags' },
	});
	input.value = fields.tags.join(', ');
	input.addEventListener('input', () => {
		fields.tags = input.value
			.split(',')
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		changed();
	});
}

function renderGreetings(parent: HTMLElement, fields: CardFields, changed: () => void) {
	const row = fieldRow(parent, 'Alternate greetings', 'alternate_greetings');
	const list = row.createDiv({ cls: 'png-card-greetings' });

	const redraw = () => {
		list.empty();
		fields.alternate_greetings.forEach((text, index) => {
			const item = list.createDiv({ cls: 'png-card-greeting' });
			const area = item.createEl('textarea', {
				attr: { rows: '3', 'aria-label': `Alternate greeting ${index + 1}` },
			});
			area.value = text;
			area.addEventListener('input', () => {
				fields.alternate_greetings[index] = area.value;
				changed();
			});
			const remove = item.createEl('button', {
				cls: 'clickable-icon png-card-greeting-delete',
				attr: { 'aria-label': 'Delete greeting' },
			});
			setIcon(remove, 'trash-2');
			remove.addEventListener('click', () => {
				fields.alternate_greetings.splice(index, 1);
				changed();
				redraw();
			});
		});
	};
	redraw();

	const add = row.createEl('button', { cls: 'png-card-add-greeting', text: 'Add greeting' });
	add.addEventListener('click', () => {
		fields.alternate_greetings.push('');
		changed();
		redraw();
		const areas = list.querySelectorAll('textarea');
		areas[areas.length - 1]?.focus();
	});
}
