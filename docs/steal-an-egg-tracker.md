# Steal an Egg Automatic Tracker

This feature is integrated into the existing FSMM Discord bot.

## Important source status

The tracker does **not** invent or simulate live spawn data. It supports two legitimate ingestion paths:

1. A real external JSON feed configured with `STEAL_EGG_SOURCE_URL`.
2. A signed HTTP push endpoint at `POST /api/steal-egg/spawn`.

The current public research found Discord communities advertising instant Secret/Eternal/Divine notifications, but their public pages do not document a usable live spawn API. Public Roblox APIs expose game metadata/player counts, not the game's internal rare-spawn event stream.

Until a verified live feed is configured, the tracker remains online and reports that no live source is configured. It will not generate fake alerts or use timers as if they were spawn detection.

## JSON event

```json
{
  "id": "unique-event-id",
  "eggName": "Kraken",
  "itemName": "Kraken",
  "rarity": "SECRET",
  "location": "Abyss Ocean",
  "spawnedAt": "2026-09-24T14:00:00Z",
  "value": "$15m/s",
  "imageUrl": "https://example.com/image.png"
}
```

No server fields are accepted or stored.

## Validation database

The tracker validates incoming rare-spawn data against `src/steal-egg-catalog.js` before alerting. Known high-confidence species can have a source rarity corrected to the catalog value. Base income is a reference value; size, mutations and bonuses can change actual in-game $/s. Disputed public data is marked instead of silently treated as certain. Unknown species are blocked when strict mode is enabled.

The catalog contains no server ID, server name, region, player count, game instance ID, join URL, or private-server information. Spawn data is treated as game-wide.

Use `/tracker info name:<pet>` to inspect rarity, base income, egg, location and confidence.

## Environment

- `STEAL_EGG_TRACKER_ENABLED=true`
- `STEAL_EGG_CATALOG_STRICT=true`
- `STEAL_EGG_ALERT_CHANNEL_ID=`
- `STEAL_EGG_ALERT_ROLE_ID=`
- `STEAL_EGG_TRACKED_RARITIES=DIVINE,ETERNAL,SECRET`
- `STEAL_EGG_SOURCE_URL=` (only a verified real feed)
- `STEAL_EGG_SOURCE_API_KEY=` (only if the documented feed requires it)
- `STEAL_EGG_POLL_INTERVAL_MS=5000`
- `STEAL_EGG_WEBHOOK_PORT=3000`
- `STEAL_EGG_WEBHOOK_SECRET=`

The existing `DISCORD_TOKEN` remains the only Discord token.


## Command system

The tracker is managed through one slash command with subcommands: `/tracker status`, `/tracker setup`, `/tracker config`, `/tracker test`, `/tracker recent`, `/tracker stats`, `/tracker health`, `/tracker sources`, `/tracker enable`, `/tracker disable`, `/tracker reload`, `/tracker help`, and `/tracker info`. Configuration actions are staff-only and use ephemeral responses. Recent detections support pagination and the status/recent panels have functional refresh/navigation buttons.

## Reliability

The tracker uses deterministic event fingerprints when a source does not provide an event ID, a bounded in-memory cache plus the persistent JSON store for duplicate protection, a serialized alert queue, alert retries with exponential backoff, request timeouts, 429 handling, source health states, and optional primary/secondary/fallback HTTP JSON sources. It never treats a missing live source as a working detector.

## Data validation

Only known rarity values are accepted. Unknown rarity values are rejected rather than guessed. Known catalog entries are cross-checked for rarity and location. In strict catalog mode, a high-confidence rarity mismatch can be corrected to the catalog value; disputed catalog entries are surfaced as a data warning instead of silently being treated as certain.

## Sources

`STEAL_EGG_SOURCE_URL` is the primary source. `STEAL_EGG_SECONDARY_SOURCE_URL` and `STEAL_EGG_FALLBACK_SOURCE_URL` are optional failover sources. These variables must point to real, documented feeds; the bot does not invent or simulate endpoints. Current public Roblox Open Cloud documentation describes APIs for resources such as data stores and game events, but it does not document a generic endpoint for another game's internal rare-spawn stream. citeturn0search0turn0search4

## Retention

Processed event IDs and recent/history records are pruned using `STEAL_EGG_RETENTION_DAYS` (default 30). The existing FSMM JSON store remains the database; no unrelated bot data is deleted or replaced.
