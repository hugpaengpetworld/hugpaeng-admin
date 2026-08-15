export function SearchHighlight({
  text,
  query,
}: {
  readonly text: string;
  readonly query: string;
}) {
  const tokens = query
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  if (tokens.length === 0) return text;

  const pattern = tokens.map(escapeRegExp).join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "giu"));
  const normalizedTokens = new Set(
    tokens.map((token) => token.toLocaleLowerCase("th-TH")),
  );

  return parts.map((part, index) =>
    normalizedTokens.has(part.toLocaleLowerCase("th-TH")) ? (
      <mark
        key={`${part}-${index}`}
        className="bg-yellow-100 font-extrabold text-inherit"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
