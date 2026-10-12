/** Jump from elsewhere on the page (the mini register) to a row of Fig. 1. */
export type Goto = { anchor: string; col: number };
const EVENT = 'register:goto';

export function gotoRow(detail: Goto) {
  window.dispatchEvent(new CustomEvent<Goto>(EVENT, { detail }));
}

export function onGoto(f: (g: Goto) => void) {
  const h = (e: Event) => f((e as CustomEvent<Goto>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
