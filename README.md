# pi-message-time

Provide creation-time metadata before user messages in Pi's model requests.

For each user message with a usable saved timestamp, the extension inserts a
separate `CustomMessage` immediately before it. Its content is exactly:

```text
System metadata: Message creation time is Monday, November 16, 2026, 06:42
```

The date is formatted in the configured timezone. Historical messages retain
their original creation times when context is sent again. User text and
attachments are not modified. Assistant messages and tool results are untouched.

Pi converts custom-message content to user-role messages for the provider; this
uses normal provider-supported roles rather than a custom model role or a
mid-conversation system message. The wording identifies the note as system
metadata. `display: false` keeps these request-only notes out of the visible chat.

The extension adds no behavioral instructions and does not change compaction.
Timestamp metadata is not added to the summarizer's input. It creates no model
requests, persistent messages or additional storage. Native session history,
branches and resumes retain their original content.

## Install

Requires Node 22.18+ and Pi 1.5.2+.

```sh
pi install git:github.com/aristath/pi-message-time
```

A local checkout can also be installed with `pi install /path/to/pi-message-time`.
Restart Pi or use `/reload` after installation or configuration changes.

## Timezone

Configure an IANA timezone in Pi settings:

```json
{
  "messageTime": {
    "timeZone": "America/New_York"
  }
}
```

Without configuration, the host timezone is used. The local date and time are
calculated for each original message, including daylight saving changes.
`/message-time` reports the effective timezone. Invalid settings warn once and
retain the last valid timezone (the host timezone initially), so a settings
mistake does not break the conversation. Correct the settings and reload Pi.

Malformed messages or unusable timestamps are left unchanged. The package never
invents a creation time. Reapplying the projection produces one metadata message
per eligible user message. Changing the timezone intentionally changes those
notes; other extensions may also change model context.

## Development

```sh
npm ci
npm run check
```

Tests use controlled provider doubles and never run live inference.
