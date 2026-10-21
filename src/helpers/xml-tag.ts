export function xmlTag(
  name: string,
  content: unknown,
  attributes?: Record<string, string | number>
): string {
  if (content === undefined || content === null) {
    return '';
  }

  const attrs = attributes
    ? Object.entries(attributes)
        .map(([key, val]) => ` ${key}="${val}"`)
        .join('')
    : '';

  const body = Array.isArray(content)
    ? content.filter(Boolean).join('\n')
    : String(content).trim();

  return `<${name}${attrs}>\n${body}\n</${name}>`;
}
