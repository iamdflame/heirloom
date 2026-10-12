/** Renders RST ``literal`` spans from advisory titles in mono, with break points after . and _ */
export function RstTitle({ text }: { text: string }) {
  const parts = text.replace(/\.$/, '').split('``');
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <code key={i} className="font-mono text-[0.86em]">
            {p.split(/(?<=[._])/).map((seg, j) => (
              <span key={j}>
                {j > 0 && <wbr />}
                {seg}
              </span>
            ))}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
