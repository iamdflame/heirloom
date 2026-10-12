import timing from '../../timing-vo.json';

export const TIMING = timing;
const WORDS = timing.words as unknown as Record<string, [string, number, number][]>;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, '').replace(/\.$/, '');

/** Frame (relative to the scene start) where the n-th occurrence of a display word starts in the owner's VO. */
export const at = (scene: string, word: string, n = 1): number => {
  const list = WORDS[scene] ?? [];
  let k = 0;
  for (const [w, s] of list) if (norm(w) === norm(word) && ++k === n) return s;
  throw new Error(`no word "${word}" (#${n}) in ${scene}`);
};
/** Frame where the n-th occurrence of a word ends. */
export const end = (scene: string, word: string, n = 1): number => {
  const list = WORDS[scene] ?? [];
  let k = 0;
  for (const [w, , e] of list) if (norm(w) === norm(word) && ++k === n) return e;
  throw new Error(`no word "${word}" (#${n}) in ${scene}`);
};
