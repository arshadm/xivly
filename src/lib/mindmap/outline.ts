// A nested Markdown list (what Claude writes, or an outline pasted in) as a
// mind map: one top-level item is the central topic; several hang under one
// named after the paper. "(p. 4)" or "[p. 4]" at the end of an item is its page link.
import { newMap, type MindMap, type Topic } from './tree';

const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const PAGE = /\s*[([]pp?\.\s*(\d+)(?:\s*[-–]\s*\d+)?[)\]]\s*$/;

/** The nested lists in a text, as a map (null when there's no list). */
export function fromOutline(markdown: string, title: string): MindMap | null {
	const items: { indent: number; text: string }[] = [];
	for (const line of markdown.replace(/\t/g, '    ').split('\n')) {
		const m = ITEM.exec(line);
		if (m && m[2].trim()) items.push({ indent: m[1].length, text: m[2].trim() });
	}
	if (!items.length) return null;
	const base = newMap(title).root;
	const top: Topic[] = [];
	// The path of open topics, by indentation.
	const stack: { indent: number; topic: Topic }[] = [];
	for (const it of items) {
		const page = PAGE.exec(it.text);
		const topic: Topic = { id: crypto.randomUUID().slice(0, 8), text: page ? it.text.slice(0, page.index).trim() : it.text, page: page ? Number(page[1]) : undefined, children: [] };
		while (stack.length && stack.at(-1)!.indent >= it.indent) stack.pop();
		if (stack.length) stack.at(-1)!.topic.children.push(topic);
		else top.push(topic);
		stack.push({ indent: it.indent, topic });
	}
	return { root: top.length === 1 ? top[0] : { ...base, children: top } };
}
