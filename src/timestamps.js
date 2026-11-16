export const SECTION = 'pi_message_time';
export const GUIDE = 'A leading <message_time> header is runtime metadata recording when that user or assistant message was created. It is not authored text or a live clock. Use its date and UTC offset to interpret temporal references. Do not emit these headers in your replies.';
export const SUMMARY_GUIDE = GUIDE + ' Preserve dates needed to interpret relative expressions such as yesterday or tomorrow; do not reinterpret them using the date this summary is generated.';

export function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset', era: 'short',
  });
}
function timestamp(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.parse(value);
}
export function formatTime(value, format) {
  const milliseconds = timestamp(value);
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8640000000000000) return null;
  const parts = Object.fromEntries(format.formatToParts(new Date(milliseconds)).map(part => [part.type, part.value]));
  const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
  const yearText = year >= 0 && year <= 9999 ? String(year).padStart(4, '0') : (year < 0 ? '-' : '+') + String(Math.abs(year)).padStart(6, '0');
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace(/^GMT/, '');
  return `${yearText}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

// Unwrap only our own projections. Literal tags in authored text are preserved.
export function createProjector() {
  const originals = new WeakMap();
  function message(input, format) {
    if (!input || typeof input !== 'object') return input;
    const original = originals.get(input) ?? input;
    if (!['user', 'assistant'].includes(original.role)) return input;
    if (original.role === 'assistant' && ['aborted', 'error'].includes(original.stopReason)) return input;
    const text = formatTime(original.timestamp, format);
    if (!text) return input;
    const header = `<message_time>${text}</message_time>\n`;
    let content;
    if (typeof original.content === 'string') {
      if (original.role === 'assistant' && !original.content.trim()) return input;
      content = header + original.content;
    } else if (Array.isArray(original.content)) {
      if (original.role === 'assistant' && !original.content.some(block => block?.type === 'toolCall' || block?.type === 'text' && block.text?.trim())) return input;
      // Signed thinking blocks must stay in their leading positions.
      let index = 0;
      if (original.role === 'assistant') while (original.content[index]?.type === 'thinking') index++;
      content = [...original.content.slice(0, index), { type: 'text', text: header }, ...original.content.slice(index)];
    } else return input;
    const projected = { ...original, content };
    originals.set(projected, original);
    return projected;
  }
  return (messages, format) => messages.map(input => message(input, format));
}

export function addGuide(messages) {
  if (messages[0]?.role !== 'system') return messages;
  const [first, ...tail] = messages;
  return [{ ...first, sections: { ...first.sections, [SECTION]: GUIDE } }, ...tail];
}
