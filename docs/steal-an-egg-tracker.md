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

## Environment

- `STEAL_EGG_TRACKER_ENABLED=true`
- `STEAL_EGG_ALERT_CHANNEL_ID=`
- `STEAL_EGG_ALERT_ROLE_ID=`
- `STEAL_EGG_TRACKED_RARITIES=DIVINE,ETERNAL,SECRET`
- `STEAL_EGG_SOURCE_URL=` (only a verified real feed)
- `STEAL_EGG_SOURCE_API_KEY=` (only if the documented feed requires it)
- `STEAL_EGG_POLL_INTERVAL_MS=5000`
- `STEAL_EGG_WEBHOOK_PORT=3000`
- `STEAL_EGG_WEBHOOK_SECRET=`

The existing `DISCORD_TOKEN` remains the only Discord token.
