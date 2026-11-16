export const CUSTOM_TYPE = 'pi-message-time:metadata';

export function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
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
  return `${parts.weekday}, ${parts.month} ${parts.day}, ${parts.year}, ${parts.hour}:${parts.minute}`;
}

// Request-only projection. Rebuilding our own notes avoids duplicates without
// inspecting or changing text written by either participant.
export function projectMessages(messages, format) {
  return messages.filter(message => message?.role !== 'custom' || message.customType !== CUSTOM_TYPE).flatMap(message => {
    if (message?.role !== 'user' || !(typeof message.content === 'string' || Array.isArray(message.content))) return [message];
    const time = formatTime(message.timestamp, format);
    if (!time) return [message];
    return [{
      role: 'custom', customType: CUSTOM_TYPE, display: false,
      timestamp: timestamp(message.timestamp),
      content: `System metadata: Message creation time is ${time}`,
    }, message];
  });
}
