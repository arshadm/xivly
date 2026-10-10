// A mind map as a block of the notes (TipTap node `mindMap`, attrs { map, height }).
// Its view is a Svelte component (MindMapView) that owns its keys and pointer:
// ProseMirror never sees them. Every change to the map is a transaction on the
// node's attrs, so the notes' undo covers maps and text alike.
import { Node } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { mount, unmount } from 'svelte';
import type { PaperAnchor } from '#lib/types.js';
import MindMapView from './MindMapView.svelte';
import { newMap, normalizeMap, type MindMap } from './tree';

const MAP_HEIGHT = 360;
const MIN_MAP_HEIGHT = 160;

export interface MindMapOptions {
	/** The central topic of a new map (the paper's title). */
	title: () => string;
	/** A page chip in a topic was clicked. */
	onjump?: (anchor: PaperAnchor) => void;
	/** Where the reader is (a topic's "link to this page"). */
	anchor?: () => PaperAnchor | null;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		mindMap: {
			/** A new mind map at the cursor (the paper's title in the middle). */
			insertMindMap: (map?: MindMap) => ReturnType;
		};
	}
}

export const MindMapNode = Node.create<MindMapOptions>({
	name: 'mindMap',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: false,

	addOptions() {
		return { title: () => 'Topic' };
	},

	addAttributes() {
		return {
			map: { default: null },
			height: { default: MAP_HEIGHT }
		};
	},

	// HTML: for copy and paste between notes (the map travels as JSON).
	parseHTML() {
		return [
			{
				tag: 'div[data-type="mind-map"]',
				getAttrs: (el) => {
					try {
						return { map: JSON.parse((el as HTMLElement).dataset.map ?? 'null'), height: Number((el as HTMLElement).dataset.height) || MAP_HEIGHT };
					} catch {
						return false;
					}
				}
			}
		];
	},

	renderHTML({ node }) {
		return ['div', { 'data-type': 'mind-map', 'data-map': JSON.stringify(node.attrs.map), 'data-height': String(node.attrs.height) }];
	},

	addCommands() {
		return {
			insertMindMap:
				(map) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs: { map: map ?? newMap(this.options.title()), height: MAP_HEIGHT } })
		};
	},

	addNodeView() {
		return ({ node, getPos, editor }) => {
			const dom = document.createElement('div');
			dom.className = 'mind-map-block';
			dom.dataset.type = 'mind-map';
			const props = $state({
				map: normalizeMap(node.attrs.map, this.options.title()),
				height: Number(node.attrs.height) || MAP_HEIGHT,
				editable: editor.isEditable,
				selected: false,
				/** A new version of the map: one undo step of its own (`history: false`: none, e.g. an empty topic tidied away). */
				onchange: (map: MindMap, opts?: { history?: boolean }) => setAttrs({ map }, opts?.history ?? true),
				onresize: (height: number) => setAttrs({ height: Math.max(MIN_MAP_HEIGHT, Math.round(height)) }),
				undo: () => editor.commands.undo(),
				redo: () => editor.commands.redo(),
				onjump: (anchor: PaperAnchor) => this.options.onjump?.(anchor),
				anchor: () => this.options.anchor?.() ?? null,
				/** Leave the map for the text after it (Esc twice, or ↓ past the last topic). */
				exit: () => {
					const pos = getPos();
					if (typeof pos === 'number') editor.chain().focus(pos + node.nodeSize).run();
				}
			});
			let current = node;
			function setAttrs(attrs: Record<string, unknown>, history = true) {
				const pos = getPos();
				if (typeof pos !== 'number') return;
				const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs });
				// Each map edit is an undo step of its own (not merged with the ones just before).
				editor.view.dispatch(history ? closeHistory(tr) : tr.setMeta('addToHistory', false));
			}
			const view = mount(MindMapView, { target: dom, props });
			return {
				dom,
				update(next) {
					if (next.type !== current.type) return false;
					current = next;
					props.map = normalizeMap(next.attrs.map, props.map.root.text);
					props.height = Number(next.attrs.height) || MAP_HEIGHT;
					props.editable = editor.isEditable;
					return true;
				},
				selectNode: () => void (props.selected = true),
				deselectNode: () => void (props.selected = false),
				// The map handles everything that happens inside it.
				stopEvent: (e) => !!(e.target as Element | null)?.closest?.('[data-mind-map-canvas]'),
				ignoreMutation: () => true,
				destroy: () => void unmount(view)
			};
		};
	}
});
