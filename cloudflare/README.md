# Traffic Watch Cloudflare Worker

This Worker checks TomTom Traffic Flow for 8 nearby road sample points and returns one small JSON summary for the DAKboard page.

The monitored points are:

| ID | Label | Point |
| --- | --- | --- |
| `ladue-west` | Ladue Rd west of home | `38.6551,-90.4936` |
| `ladue-east` | Ladue Rd east of home | `38.6548,-90.4247` |
| `i64-eb-mason` | I-64 EB near Mason | `38.6384,-90.4826` |
| `i64-wb-mason` | I-64 WB near Mason | `38.6386,-90.4826` |
| `i64-eb-270` | I-64 EB near I-270 | `38.6362,-90.4490` |
| `i64-wb-270` | I-64 WB near I-270 | `38.6372,-90.4490` |
| `i270-nb-ladue` | I-270 NB near Ladue | `38.6545,-90.4480` |
| `i270-sb-ladue` | I-270 SB near Ladue | `38.6545,-90.4495` |

For divided highways, the sample point is offset onto the expected carriageway so the label indicates direction. Ladue Road is monitored as surface-road segments by location.

The Worker asks TomTom for freeway flow segment data at zoom level 16. Higher zoom levels reduce the chance that an interstate sample point snaps to a nearby ramp or local road instead of the main freeway segment. Ladue Road uses zoom level 12 because surface-road points were less reliable at the higher freeway zoom.

## Free-tier usage

TomTom Flow Segment Data is a non-tile request. With 8 sample points and a 10-minute Worker cache:

```text
8 points x 6 checks/hour x 24 hours = 1,152 TomTom requests/day
```

That is below the 2,500 non-tile requests/day free allowance.

## Deploy

1. Create a Cloudflare Worker named `traffic-watch`.
2. Paste the contents of `traffic-watch-worker.js`.
3. Add a Worker secret:

```text
TOMTOM_API_KEY
```

4. Deploy the Worker.
5. Confirm it returns JSON at:

```text
https://traffic-watch.randywilliams-us.workers.dev/
```

If Cloudflare gives you a different URL, update `TRAFFIC_STATUS_URL` in `dakboard-fullcalendar-month.html`.

## Expected response

```json
{
  "level": "Clear nearby",
  "mode": "good",
  "meter": 12,
  "detail": "Interstates and Ladue Road look normal within the watched area.",
  "updatedAt": "2026-05-16T13:30:00.000Z",
  "segmentCount": 8,
  "checkedCount": 8,
  "segments": []
}
```

## Alert thresholds

- Clear: less than 20% slower than normal
- Watch: 20% slower or 8+ minutes delay
- Major backup: 45% slower or 15+ minutes delay
- Interstate watch: 45 mph or slower, even if TomTom reports that as normal for the sampled segment
- Interstate major backup: 30 mph or slower
- Closure: TomTom road closure flag
