// A drawing as a block of the notes (TipTap node `drawing`, attrs { scene, height }).
// Its view is a Svelte component (DrawingView) that owns its keys, pointer and
// clipboard: ProseMirror never sees them. Every change to the drawing is a
// transaction on the node's attrs, so the notes' undo covers drawings and text alike.
import { Node } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { mount, unmount } from 'svelte';
import type { NoteAssets } from '#lib/notes/images.js';
import type { PaperAnchor } from '#lib/types.js';
import DrawingView from './DrawingView.svelte';
import { newId, newScene, normalizeScene, type Scene } from './scene';

const DRAWING_HEIGHT = 400;

// Each scene in the node's attrs read once: the same objects come back (undo, redo, the
// drawing's own edits), and the view draws an unchanged shape again from its cache.
const read = new WeakMap<object, Scene>();
function sceneOf(raw: unknown): Scene {
	if (!raw || typeof raw !== 'object') return normalizeScene(raw);
	let scene = read.get(raw);
	if (!scene) read.set(raw, (scene = normalizeScene(raw)));
	return scene;
}
const MIN_DRAWING_HEIGHT = 160;

export interface DrawingOptions {
	/** Where images are kept (none: images can't be added). */
	assets: NoteAssets | null;
	/** An image's page badge was clicked. */
	onjump?: (anchor: PaperAnchor) => void;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		drawing: {
			/** A new drawing at the cursor (empty, or the one given). */
			insertDrawing: (scene?: Scene) => ReturnType;
		};
	}
}

export const DrawingNode = Node.create<DrawingOptions>({
	name: 'drawing',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: false,

	addOptions() {
		return { assets: null };
	},

	addAttributes() {
		return {
			scene: { default: null },
			height: { default: DRAWING_HEIGHT }
		};
	},

	// HTML: for copy and paste between notes (the drawing travels as JSON).
	parseHTML() {
		return [
			{
				tag: 'div[data-type="drawing"]',
				getAttrs: (el) => {
					try {
						// Pasted: a drawing of its own (its own file next to the notes), not the one copied.
						const scene = JSON.parse((el as HTMLElement).dataset.scene ?? 'null');
						return { scene: scene && typeof scene === 'object' ? { ...scene, id: newId() } : scene, height: Number((el as HTMLElement).dataset.height) || DRAWING_HEIGHT };
					} catch {
						return false;
					}
				}
			}
		];
	},

	renderHTML({ node }) {
		return ['div', { 'data-type': 'drawing', 'data-scene': JSON.stringify(node.attrs.scene), 'data-height': String(node.attrs.height) }];
	},

	addCommands() {
		return {
			insertDrawing:
				(scene) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs: { scene: scene ?? newScene(), height: DRAWING_HEIGHT } })
		};
	},

	addNodeView() {
		return ({ node, getPos, editor }) => {
			const dom = document.createElement('div');
			dom.className = 'drawing-block';
			dom.dataset.type = 'drawing';
			let current = node;
			const props = $state({
				scene: sceneOf(node.attrs.scene),
				height: Number(node.attrs.height) || DRAWING_HEIGHT,
				editable: editor.isEditable,
				selected: false,
				assets: this.options.assets,
				/** A new version of the drawing: one undo step of its own (`history: false`: none). */
				onchange: (scene: Scene, opts?: { history?: boolean }) => (read.set(scene, scene), setAttrs({ scene }, opts?.history ?? true)),
				onresize: (height: number) => setAttrs({ height: Math.max(MIN_DRAWING_HEIGHT, Math.round(height)) }),
				undo: () => editor.commands.undo(),
				redo: () => editor.commands.redo(),
				onjump: (anchor: PaperAnchor) => this.options.onjump?.(anchor),
				/** Leave the drawing for the text after it. */
				exit: () => {
					const pos = getPos();
					if (typeof pos === 'number') editor.chain().focus(pos + current.nodeSize).run();
				}
			});
			function setAttrs(attrs: Record<string, unknown>, history = true) {
				const pos = getPos();
				if (typeof pos !== 'number') return;
				const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs });
				// Each drawing edit is an undo step of its own (not merged with the ones just before).
				editor.view.dispatch(history ? closeHistory(tr) : tr.setMeta('addToHistory', false));
			}
			const view = mount(DrawingView, { target: dom, props });
			return {
				dom,
				update(next) {
					if (next.type !== current.type) return false;
					current = next;
					props.scene = sceneOf(next.attrs.scene);
					props.height = Number(next.attrs.height) || DRAWING_HEIGHT;
					props.editable = editor.isEditable;
					return true;
				},
				selectNode: () => void (props.selected = true),
				deselectNode: () => void (props.selected = false),
				// The drawing handles everything that happens inside it.
				stopEvent: (e) => !!(e.target as Element | null)?.closest?.('[data-drawing-canvas]'),
				ignoreMutation: () => true,
				destroy: () => void unmount(view)
			};
		};
	}
});
