/** Read-only summary of an XMP packet (stored in PNG as iTXt "XML:com.adobe.xmp"). */

export const XMP_KEYWORD = 'XML:com.adobe.xmp';

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const PREFIXES: Record<string, string> = {
	'http://purl.org/dc/elements/1.1/': 'dc',
	'http://ns.adobe.com/xap/1.0/': 'xmp',
	'http://ns.adobe.com/xap/1.0/rights/': 'xmpRights',
	'http://ns.adobe.com/xap/1.0/mm/': 'xmpMM',
	'http://ns.adobe.com/photoshop/1.0/': 'photoshop',
	'http://ns.adobe.com/tiff/1.0/': 'tiff',
	'http://ns.adobe.com/exif/1.0/': 'exif',
	'http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/': 'Iptc4xmpCore',
};

const FRIENDLY: Record<string, string> = {
	'dc:title': 'Title',
	'dc:creator': 'Creator',
	'dc:description': 'Description',
	'dc:subject': 'Keywords',
	'dc:rights': 'Rights',
	'xmp:CreatorTool': 'Creator tool',
	'xmp:CreateDate': 'Created',
	'xmp:ModifyDate': 'Modified',
	'xmp:MetadataDate': 'Metadata date',
	'xmp:Rating': 'Rating',
	'photoshop:Headline': 'Headline',
	'photoshop:Credit': 'Credit',
	'photoshop:Source': 'Source',
	'xmpRights:UsageTerms': 'Usage terms',
};

export interface XmpProperty {
	/** Qualified name, e.g. "dc:title". */
	name: string;
	/** Friendly label, e.g. "Title". */
	label: string;
	value: string;
}

function qualifiedName(node: Element | Attr): string {
	const prefix = (node.namespaceURI && PREFIXES[node.namespaceURI]) || node.prefix || '';
	const local = node.localName ?? node.nodeName;
	return prefix ? `${prefix}:${local}` : local;
}

function elementChildren(node: Node): Element[] {
	const out: Element[] = [];
	for (let i = 0; i < node.childNodes.length; i++) {
		const child = node.childNodes[i]!;
		if (child.nodeType === 1) out.push(child as Element);
	}
	return out;
}

/** The value of a property element: plain text, or the items of an rdf:Alt/Seq/Bag. */
function propertyValue(el: Element): string {
	const container = elementChildren(el).find(
		(c) => c.namespaceURI === RDF_NS && ['Alt', 'Seq', 'Bag'].includes(c.localName ?? ''),
	);
	if (container) {
		const items = elementChildren(container).filter((c) => c.namespaceURI === RDF_NS && c.localName === 'li');
		return items.map((li) => (li.textContent ?? '').trim()).join(', ');
	}
	const nested = elementChildren(el);
	if (nested.length > 0) {
		return nested.map((c) => `${qualifiedName(c)}: ${(c.textContent ?? '').trim()}`).join('; ');
	}
	return (el.textContent ?? '').trim();
}

/** List the properties in an XMP packet. Throws if the XML can't be parsed. */
export function parseXmp(xml: string, parser: DOMParser = new DOMParser()): XmpProperty[] {
	const doc = parser.parseFromString(xml.replace(BOM, ''), 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('XMP is not well-formed XML');
	}
	const props: XmpProperty[] = [];
	const add = (name: string, value: string) => {
		if (value) props.push({ name, label: FRIENDLY[name] ?? name, value });
	};
	const descriptions = doc.getElementsByTagNameNS(RDF_NS, 'Description');
	for (let i = 0; i < descriptions.length; i++) {
		const desc = descriptions[i]!;
		for (let a = 0; a < desc.attributes.length; a++) {
			const attr = desc.attributes[a]!;
			const ns = attr.namespaceURI;
			if (ns === RDF_NS || ns === XML_NS || ns === 'http://www.w3.org/2000/xmlns/' || attr.name.startsWith('xmlns')) {
				continue;
			}
			add(qualifiedName(attr), attr.value);
		}
		for (const child of elementChildren(desc)) {
			add(qualifiedName(child), propertyValue(child));
		}
	}
	return props;
}
