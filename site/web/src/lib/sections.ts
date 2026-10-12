/** Nav anchors: [id, label, on the desktop bar]. Every id is a section on the page (checked by qa.mjs). */
export const SECTIONS = [
  ['watch', 'Watch it work', true],
  ['finding', 'Finding', true],
  ['register', 'Register', true],
  ['movement', 'Method', true],
  ['question', 'The question', false],
  ['numbers', 'Proof', true],
  ['economics', 'Economics', false],
  ['evidence', 'Evidence', true],
  ['limits', 'Limits', false],
] as const;
