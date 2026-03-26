# Feature Spec: GPS Distance to Pin

## Overview

Show each player their real-time distance to the green/pin using phone GPS combined with course hole coordinate data from the Golf Course API. This feature lives within the active contest view — not as a standalone screen — so players see distance context alongside scores and the leaderboard.

## Current State

- **Golf Course API** (`src/services/course-api.ts`) returns `TeeBoxHole` with `yards` and `meters` per hole, but no GPS coordinates (lat/lng for greens/tees)
- **Course object** stored in contests has `HoleInfo`: `{ num, par, hcp, yards }` — no geolocation
- **No location permissions** currently requested
- **Contest tabs**: Leaderboard | Scorecard | Games | Settlement — no GPS/distance tab
- The user wants to combine Leaderboard and Games into one tab to make room

## Data Sources

### Golf Course API Coordinates

The golfcourseapi.com API may return hole-level GPS coordinates (green center lat/lng) for some courses. We need to check if the API provides this — it's not currently parsed in `getCourseDetail()`.

If available, extend the response parsing:
```typescript
export interface TeeBoxHole {
  number: number;
  par: number;
  yards: number;
  meters: number;
  handicap: number;
  greenLat?: number;   // NEW
  greenLng?: number;   // NEW
  teeLat?: number;     // NEW
  teeLng?: number;     // NEW
}
```

And extend `HoleInfo` in the engine types:
```typescript
export interface HoleInfo {
  num: number;
  par: number;
  hcp: number;
  yards: number;
  greenLat?: number;   // NEW
  greenLng?: number;   // NEW
  teeLat?: number;     // NEW
  teeLng?: number;     // NEW
}
```

### Phone GPS

Use `expo-location` for the player's current position:

```typescript
import * as Location from 'expo-location';

// Request permission once when GPS feature is first activated
const { status } = await Location.requestForegroundPermissionsAsync();

// High-accuracy watch for continuous updates
const subscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 2,  // update every 2 meters of movement
    timeInterval: 3000,   // or every 3 seconds
  },
  (location) => {
    // location.coords.latitude, location.coords.longitude
  }
);
```

### Distance Calculation

Haversine formula for GPS-to-green distance:

```typescript
function distanceYards(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const meters = R * c;
  return Math.round(meters * 1.09361); // convert to yards
}
```

## UI Design

### Tab Restructure

Combine the existing 4 tabs into 3 to make room for the GPS distance view:

**Before:** Leaderboard | Scorecard | Games | Settlement

**After:** Live | Scorecard | Settlement

The **Live** tab merges Leaderboard + Games + GPS Distance into a single scrollable view:

```
┌─────────────────────────────────────┐
│  🏌️ Live                            │
├─────────────────────────────────────┤
│                                     │
│  DISTANCE TO GREEN                  │
│  ┌─────────────────────────────┐    │
│  │  Hole 7 · Par 4             │    │
│  │                              │    │
│  │      156                     │    │
│  │      YDS                     │    │
│  │                              │    │
│  │  Front: 142  Back: 168       │    │
│  └─────────────────────────────┘    │
│                                     │
│  LEADERBOARD                        │
│  ┌──────────────────────────────┐   │
│  │ 1  Mike S.     -2  (70)     │   │
│  │ 2  Dave R.      E  (72)     │   │
│  │ 3  Ted J.      +3  (75)     │   │
│  └──────────────────────────────┘   │
│                                     │
│  GAME RESULTS                       │
│  ┌──────────────────────────────┐   │
│  │ Nassau          Mike +$5     │   │
│  │ Skins           3 unclaimed  │   │
│  │ Snake           Dave holds   │   │
│  └──────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

### Distance Card Design

The distance card is the hero element at the top of the Live tab:

- Large yardage number in the center (72pt, COLORS.primary)
- Current hole number and par displayed above
- Front/middle/back of green distances if data supports it (otherwise just center)
- Elevation change indicator if available
- Auto-advances to next hole based on GPS proximity to the green (within 30 yards of green center → assume player is on/near green → advance to next hole after a delay)
- Manual hole selector (left/right arrows) as override
- Gradient ring around the distance that shifts from green (close) to gold (mid) to red (far)
- "GPS" indicator dot — green when signal is strong, yellow when weak

### Fallback: No GPS Coordinates Available

If the course API doesn't provide green coordinates for a given course:

- Show the hole's total yardage from the tee box data instead
- Display a message: "GPS distance unavailable for this course — showing hole yardage"
- Still show the manual hole selector so the player can track which hole they're on

### GPS Permission Flow

1. First time player taps the Live tab, show an explanation card: "Enable GPS to see your distance to the green in real time"
2. "Enable GPS" button triggers the permission prompt
3. If denied, collapse the distance card and show the leaderboard + games normally
4. Permission state stored in settings-store

## Battery & Performance

- Only watch GPS when the Live tab is active and the app is in the foreground
- Stop the location subscription when navigating away from the contest or backgrounding
- `distanceInterval: 2` means updates only fire when the player moves 2+ meters — minimal battery impact during a round
- Cache the last known position so the card doesn't flash "Loading" on tab switches

## New Files

| File | Purpose |
|------|---------|
| `src/services/gps.ts` | Location permission, watch subscription, distance calculation |
| `src/ui/DistanceCard.tsx` | Hero distance display component |
| `app/contest/[id]/live.tsx` | New Live tab combining distance + leaderboard + games |

## Modified Files

| File | Changes |
|------|---------|
| `src/engine/types.ts` | Add `greenLat`, `greenLng`, `teeLat`, `teeLng` to `HoleInfo` |
| `src/services/course-api.ts` | Parse GPS coordinates from API response if available |
| `app/contest/[id]/_layout.tsx` | Replace 4-tab layout with 3 tabs (Live, Scorecard, Settlement) |
| `app/contest/[id]/index.tsx` | Refactor into `live.tsx` — add distance card above existing leaderboard |
| `app/contest/[id]/games.tsx` | Move game results rendering into the Live tab as a section |
| `src/stores/settings-store.ts` | Add `gpsEnabled` preference |
| `app.json` | Add `expo-location` plugin with permission string |

## Dependencies

```bash
npx expo install expo-location
```

Add to `app.json` plugins:
```json
["expo-location", {
  "locationWhenInUsePermission": "SnapScore uses your location to show distance to the green during your round."
}]
```

## Implementation Order

1. **Check Golf Course API** for GPS coordinate availability — this determines whether the feature is useful on day one or needs a fallback
2. **Build `gps.ts` service** — permission request, location watch, distance calc
3. **Build `DistanceCard.tsx`** — the hero UI component
4. **Create `live.tsx`** — merge leaderboard + games + distance into one tab
5. **Restructure `_layout.tsx`** — swap to 3-tab layout
6. **Parse GPS coords from course API** (if available)
7. **Auto hole advancement** — detect proximity to green and advance

## Open Questions

- Does golfcourseapi.com return green GPS coordinates? Need to test with a real course. If not, we may need a secondary data source or manual pin-drop (Phase 2).
- Should distance show yards or meters? Probably a user preference in settings.
- Do we want to show distance to other players too? (e.g., "Mike is 85 yds ahead of you") — interesting for match play, but scope creep for v1.
- Should the auto-advance logic use geofencing (enter a radius around the green) or time-based (hasn't moved in 2 min near the green)?
