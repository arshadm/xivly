// Bumped when a paper's cover changes, so the cards showing it fetch the new one.
class CoverVersions {
	#v = $state<Record<string, number>>({});
	of(id: string) {
		return this.#v[id] ?? 0;
	}
	bump(id: string) {
		this.#v[id] = (this.#v[id] ?? 0) + 1;
	}
}

export const coverVersions = new CoverVersions();
