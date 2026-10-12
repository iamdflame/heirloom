// The spine: the brief's VO text (verbatim) and the target scene lengths in seconds.
export const SCENES = [
  { id: 'S01', title: 'End of life', target: 9, vo: 'On the seventh of April, Django four-point-two reached end of life. No more security fixes.' },
  { id: 'S02', title: 'Still shipped', target: 12, vo: 'But Debian thirteen and Ubuntu twenty-four-oh-four still ship it. Since then, Django has published nineteen security advisories — and not one official patch for four-point-two.' },
  { id: 'S03', title: 'The finding', target: 20, vo: "On October first, Ubuntu shipped a backport for one of them. Five days later, Django said its original fix was incomplete. We took Ubuntu's source package, ran a test calibrated on Django's own fix commits… and the code path Django closed is still reachable in Ubuntu's build." },
  { id: 'S04', title: 'Heirloom', target: 11, vo: 'That test was run by Heirloom — an agent that keeps end-of-life software patched, and proves which old versions are actually vulnerable.' },
  { id: 'S05', title: 'The method', target: 19, vo: "Its first rule: never trust a test that hasn't failed. For each advisory, Heirloom writes its own test, proves it fails on Django's vulnerable code and passes on the fix… and only then asks the real question: is the old version affected?" },
  { id: 'S06', title: 'The campaign', target: 28, vo: 'Then we let it run the whole campaign: nineteen advisories, replayed in the order Django published them. Thirteen candidate backports — each one failing before the fix, and passing after. Where it couldn\'t prove something, it filed the evidence instead of guessing. And when a new fix amended one it had already backported, it stacked the follow-up on its own pull request.' },
  { id: 'S07', title: 'One question', target: 17, vo: 'Across the whole campaign, it asked me one question — a real judgement call about changing Django\'s behaviour. I answered once. It sealed the answer as a precedent, and the next case reused it without asking.' },
  { id: 'S08', title: 'Proof', target: 23, vo: 'We tested the method on cases with known answers. A naive pipeline once called a vulnerable version safe. Heirloom: zero times. Every claim in every pull request links to its neat-logs trace, and every backport links the Entire session of the agent that wrote it.' },
  { id: 'S09', title: 'Economics', target: 11, vo: "Each advisory cost about twenty cents of model time. We modelled the business in C-F-O dot A-I: what that's worth to the teams who keep old software alive." },
  { id: 'S10', title: 'Kept honest', target: 15, vo: 'Heirloom. Old software, kept honest. Every verdict is a test run you can open.' },
];
export const FPS = 60;
export const HEAD = 0.4;
export const TAIL = 0.6;
export const END_HOLD = 4;
