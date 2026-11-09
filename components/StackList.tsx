export function StackList({ stack, label }: { stack: string[]; label: string }) {
  return (
    <ul className="stack" aria-label={label}>
      {stack.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
