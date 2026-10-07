// Plain names and icons for annotations (the notes list), for every kind svelte-pdf-mini has.
import type { AnnotationKind } from 'svelte-pdf-mini';
import { toolIcons } from './icons';

export const kindLabels: Record<AnnotationKind, string> = {
	highlight: 'Highlight',
	underline: 'Underline',
	strikeout: 'Strikethrough',
	squiggly: 'Squiggly underline',
	area: 'Box',
	rect: 'Box',
	ellipse: 'Ellipse',
	line: 'Line',
	arrow: 'Arrow',
	polygon: 'Polygon',
	polyline: 'Polyline',
	note: 'Note',
	ink: 'Drawing',
	freetext: 'Text',
	stamp: 'Stamp'
};

export const kindIcons: Record<AnnotationKind, string> = {
	highlight: toolIcons.highlight,
	underline: toolIcons.underline,
	strikeout: toolIcons.strikeout,
	squiggly: toolIcons.squiggly,
	area: toolIcons.area,
	rect: toolIcons.rect,
	ellipse: toolIcons.ellipse,
	line: toolIcons.line,
	arrow: toolIcons.arrow,
	polygon: 'icon-[lucide--pentagon]',
	polyline: 'icon-[lucide--waypoints]',
	note: toolIcons.note,
	ink: toolIcons.ink,
	freetext: toolIcons.freetext,
	stamp: 'icon-[lucide--stamp]'
};

/** What a row shows when the annotation has no text of its own. */
export const emptyText: Partial<Record<AnnotationKind, string>> = {
	note: 'Empty note',
	freetext: 'Empty text box',
	highlight: 'No text',
	underline: 'No text',
	strikeout: 'No text',
	squiggly: 'No text'
};
