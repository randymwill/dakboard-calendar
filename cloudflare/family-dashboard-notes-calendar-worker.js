const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

const NOTES_ICS_URL = "https://calendar.google.com/calendar/ical/5d18c531e1eaaccea48548133e3dd17f39043720fd38c1f404bc028cbf9187f1%40group.calendar.google.com/public/basic.ics";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    try {
      const calendarUrl = env.NOTES_ICS_URL || NOTES_ICS_URL;
      const upstream = await fetch(calendarUrl);
      const text = await upstream.text();

      return new Response(text, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/calendar; charset=utf-8"
        }
      });
    } catch (error) {
      return new Response(`Calendar proxy failed: ${error && error.message ? error.message : String(error)}`, {
        status: 502,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
  }
};
