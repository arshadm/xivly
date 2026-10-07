// Note emoji: what the default ones mean (toolbar tooltips) and the picker's curated choices.

/** Meaning of each default note emoji (svelte-pdf-mini's `defaultNoteEmojis`). */
const meanings: Record<string, string> = {
	'💬': 'Comment',
	'🤔': 'Question, not sure',
	'💡': 'Idea',
	'🤯': 'Key insight',
	'🧐': 'Look closer',
	'🤨': 'Doubtful claim',
	'😍': 'Love this',
	'📌': 'To-do, follow up'
};

/** Tooltip for a note emoji: its meaning when it's one of the defaults. */
export const noteEmojiLabel = (emoji: string) => meanings[emoji] ?? 'Note emoji';

/** The settings picker's grid: mostly faces, then a few symbols. */
export const noteEmojiChoices = [
	...['😀', '😃', '😄', '😁', '😅', '🥲', '😊', '🙂', '🙃', '😉', '😍', '🥹', '😮', '😯', '😲', '🤯', '😵‍💫', '🫠', '🤔', '🧐', '🤨', '😐', '😑', '😶', '🙄', '😬', '😤', '😡', '😱', '😨', '😢', '😭', '🥱', '😴', '🤓', '😎', '🤩', '🥳', '🫡', '🤗', '🤭', '🫣', '🤫'],
	...['💬', '💡', '📌', '❓', '❗', '✅', '❌', '🔥', '🎯', '🔗', '📝', '⚠️', '🧪', '📊', '🧠']
];

/** An emoji chip (toolbar, popover): the active one is ringed like the active color. */
export const emojiChip =
	'grid size-6 place-items-center rounded-md font-emoji text-[15px] leading-none outline-none hover:bg-stone-200/70 focus-visible:ring-[1.5px] focus-visible:ring-blue-500 data-[active]:bg-stone-200/70 data-[active]:ring-[1.5px] data-[active]:ring-stone-800 dark:hover:bg-stone-800 dark:data-[active]:bg-stone-800 dark:data-[active]:ring-stone-100';
