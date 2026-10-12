import { Hallmark } from './Hallmark';

/** v1 name for the brand mark; v2 draws the guilloché hallmark. */
export function Seal({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return <Hallmark size={size} className={className} title={title} />;
}
