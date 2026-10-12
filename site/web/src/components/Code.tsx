/** Renders RST ``literal`` spans from advisory titles in mono, with break points after . and _ */
export function RstTitle({ text }: { text: string }) {
  const parts = text.replace(/\.$/, '').split('``');
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <code key={i} className="font-mono text-[0.86em]">
            <Breakable text={p} />
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** A long identifier with break opportunities after . and _ (never mid-word). */
export function Breakable({ text }: { text: string }) {
  return (
    <>
      {text.split(/(?<=[._])/).map((seg, j) => (
        <span key={j}>
          {j > 0 && <wbr />}
          {seg}
        </span>
      ))}
    </>
  );
}
