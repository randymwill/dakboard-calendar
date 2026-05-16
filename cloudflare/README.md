# Traffic Watch Cloudflare Worker

This Worker checks TomTom Traffic Flow for 8 nearby road sample points and returns one small JSON summary for the DAKboard page.

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
- Closure: TomTom road closure flag
