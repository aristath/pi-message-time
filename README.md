# pi-message-time

Give Pi's model the creation date and time of user and assistant messages through
small inline headers. Uses saved message timestamps, not the time of each request.
The same historical message keeps the same header across tool loops, resumes and
branches. No separate clock messages or model calls are created.

The model receives:

```text
<message_time>2026-06-01T09:30:00+00:00</message_time>
The message's original text.
```

Saved messages, reasoning, attachments, tool arguments and results remain
unchanged. Headers are request-only and do not appear in Pi's normal transcript,
TUI or a web UI that renders canonical messages. A short system section explains
the annotations and tells the model to omit them from replies. Like any model
instruction, this is guidance rather than an output filter.

## Install

Requires Node 22.18+ and Pi 1.5.2+.

```sh
pi install git:github.com/aristath/pi-message-time
```

A local checkout can also be installed with `pi install /path/to/pi-message-time`.
Restart Pi or use `/reload` after installing or changing configuration. It works
through Pi's normal extension mechanism in terminal, RPC and SDK sessions.

## Timezone

The default is the host's timezone as resolved by Node's `Intl` implementation.
Configure an IANA timezone in Pi's normal settings:

```json
{
  "messageTime": {
    "timeZone": "America/New_York"
  }
}
```

The UTC offset is calculated for the original message date, including daylight
saving time. `/message-time` reports the effective timezone. Invalid settings
warn once and retain the last valid timezone (the host timezone initially),
allowing the chat to continue. Correct the settings and reload Pi to apply them.
No process environment configuration is required.

## Context and compaction

Only user and assistant messages with usable saved timestamps and content are
annotated. Tool results, system messages, extension observations, compaction and
branch summaries are not dated as if they were newly authored chat messages.
Empty/failed assistant replies and messages with invalid timestamps remain
unchanged; the package never invents a creation time.

Headers are added to content, preserving roles and tool-call relationships.
Signed leading thinking blocks remain in place. Authored text resembling a
`message_time` header is preserved as authored text.

Pi's native compaction also receives the annotated history and guidance to retain
relevant dates and interpret relative dates against the original messages. This
uses Pi's existing summarizer and does not create another inference request.
Older timestamps compact with their conversation; no permanent timestamp log is
re-injected after compaction. A resumed session uses its original message dates.

Increasing history size adds one small header per eligible message. Changing the
timezone intentionally changes the model-facing headers; otherwise the package
keeps existing prefixes stable. Other extensions may still change context.

## Development

```sh
npm ci
npm run check
```

Tests use controlled provider doubles. They do not run live inference.
