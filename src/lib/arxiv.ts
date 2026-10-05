// arXiv ids from whatever the user pastes: abs / pdf / html links (any
// version), "arXiv:2609.38426", a bare id, or an alphaXiv / Hugging Face
// paper page.
const ID = String.raw`(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?`;
const URL_RE = new RegExp(String.raw`^(?:https?:\/\/)?(?:www\.|export\.)?(?:arxiv\.org\/(?:abs|pdf|html|format|src)|alphaxiv\.org\/(?:abs|overview)|huggingface\.co\/papers)\/${ID}(?:\.pdf)?\/?(?:[?#].*)?$`, 'i');
const BARE_RE = new RegExp(String.raw`^(?:arxiv:\s*)?${ID}$`, 'i');

export interface ArxivRef {
	/** Without version, e.g. "2609.38426". */
	id: string;
	/** e.g. "v2", when given. */
	version?: string;
}

export function parseArxiv(input: string): ArxivRef | null {
	const s = input.trim();
	const m = URL_RE.exec(s) ?? BARE_RE.exec(s);
	return m ? { id: m[1], version: m[2] } : null;
}
