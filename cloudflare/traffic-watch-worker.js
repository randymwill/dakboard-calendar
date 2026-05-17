const CACHE_SECONDS = 10 * 60;
const CACHE_KEY_VERSION = "direction-v2";

const SEGMENTS = [
  {
    id: "ladue-west",
    name: "Ladue Rd west of home",
    road: "Ladue Rd",
    direction: "surface",
    point: "38.6551,-90.4936",
  },
  {
    id: "ladue-east",
    name: "Ladue Rd east of home",
    road: "Ladue Rd",
    direction: "surface",
    point: "38.6548,-90.4247",
  },
  {
    id: "i64-eb-mason",
    name: "I-64 EB near Mason",
    road: "I-64",
    direction: "EB",
    point: "38.6361,-90.4826",
  },
  {
    id: "i64-wb-mason",
    name: "I-64 WB near Mason",
    road: "I-64",
    direction: "WB",
    point: "38.6371,-90.4826",
  },
  {
    id: "i64-eb-270",
    name: "I-64 EB near I-270",
    road: "I-64",
    direction: "EB",
    point: "38.6362,-90.4490",
  },
  {
    id: "i64-wb-270",
    name: "I-64 WB near I-270",
    road: "I-64",
    direction: "WB",
    point: "38.6372,-90.4490",
  },
  {
    id: "i270-nb-ladue",
    name: "I-270 NB near Ladue",
    road: "I-270",
    direction: "NB",
    point: "38.6545,-90.4488",
  },
  {
    id: "i270-sb-ladue",
    name: "I-270 SB near Ladue",
    road: "I-270",
    direction: "SB",
    point: "38.6545,-90.4498",
  },
];

const HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "cache-control": `public, max-age=${CACHE_SECONDS}`,
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: HEADERS });
    }

    if (!env.TOMTOM_API_KEY) {
      return jsonResponse(buildError("Missing TOMTOM_API_KEY Worker secret"), 500);
    }

    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).origin + `/traffic-status-${CACHE_KEY_VERSION}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const startedAt = Date.now();
    const results = await Promise.all(SEGMENTS.map(segment => fetchSegment(segment, env.TOMTOM_API_KEY)));
    const body = buildSummary(results, startedAt);
    const response = jsonResponse(body);

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

async function fetchSegment(segment, apiKey) {
  const url = new URL("https://api.tomtom.com/traffic/services/4/flowSegmentData/relative-delay/12/json");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("point", segment.point);
  url.searchParams.set("unit", "mph");

  try {
    const response = await fetch(url.toString(), {
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`TomTom HTTP ${response.status}`);

    const data = await response.json();
    const flow = data.flowSegmentData || {};
    const currentTravelTime = Number(flow.currentTravelTime);
    const freeFlowTravelTime = Number(flow.freeFlowTravelTime);
    const currentSpeed = Number(flow.currentSpeed);
    const freeFlowSpeed = Number(flow.freeFlowSpeed);
    const confidence = Number(flow.confidence);
    const roadClosure = Boolean(flow.roadClosure);
    const ratio = freeFlowTravelTime > 0 ? currentTravelTime / freeFlowTravelTime : 1;
    const delayMinutes = Math.max(0, (currentTravelTime - freeFlowTravelTime) / 60);
    const status = classifySegment({ ratio, delayMinutes, roadClosure });

    return {
      ...segment,
      status,
      ratio: round(ratio, 2),
      delayMinutes: round(delayMinutes, 1),
      currentSpeed: Number.isFinite(currentSpeed) ? round(currentSpeed, 1) : null,
      freeFlowSpeed: Number.isFinite(freeFlowSpeed) ? round(freeFlowSpeed, 1) : null,
      confidence: Number.isFinite(confidence) ? round(confidence, 2) : null,
      roadClosure,
    };
  } catch (error) {
    return {
      ...segment,
      status: "unknown",
      error: error && error.message ? error.message : "Unknown TomTom error",
    };
  }
}

function classifySegment({ ratio, delayMinutes, roadClosure }) {
  if (roadClosure) return "closure";
  if (ratio >= 1.45 || delayMinutes >= 15) return "bad";
  if (ratio >= 1.2 || delayMinutes >= 8) return "watch";
  return "good";
}

function buildSummary(segments, startedAt) {
  const ranked = segments.slice().sort((a, b) => severityScore(b) - severityScore(a));
  const worst = ranked[0] || {};
  const problemSegments = segments.filter(segment => ["closure", "bad", "watch"].includes(segment.status));
  const checkedCount = segments.filter(segment => segment.status !== "unknown").length;
  const level = levelForWorst(worst);
  const mode = modeForWorst(worst);

  return {
    level,
    mode,
    meter: meterForWorst(worst),
    detail: detailFor(problemSegments, checkedCount),
    updatedAt: new Date().toISOString(),
    generatedInMs: Date.now() - startedAt,
    segmentCount: segments.length,
    checkedCount,
    segments,
  };
}

function levelForWorst(worst) {
  if (worst.status === "closure") return "Closure nearby";
  if (worst.status === "bad") return "Major backup";
  if (worst.status === "watch") return "Slower than normal";
  if (worst.status === "unknown") return "Traffic partially unavailable";
  return "Clear nearby";
}

function modeForWorst(worst) {
  if (worst.status === "closure" || worst.status === "bad") return "bad";
  if (worst.status === "watch" || worst.status === "unknown") return "watch";
  return "good";
}

function meterForWorst(worst) {
  if (worst.status === "closure") return 100;
  if (!Number.isFinite(worst.ratio)) return 45;
  return Math.max(12, Math.min(100, Math.round((worst.ratio - 1) * 135)));
}

function detailFor(problemSegments, checkedCount) {
  if (!checkedCount) return "Could not check TomTom traffic right now.";
  if (!problemSegments.length) return "Interstates and Ladue Road look normal within the watched area.";

  return problemSegments
    .slice(0, 3)
    .map(segment => {
      if (segment.status === "closure") return `${segment.name}: closure reported`;
      const percent = Math.max(0, Math.round((Number(segment.ratio || 1) - 1) * 100));
      return `${segment.name}: ${percent}% slower than normal`;
    })
    .join(" • ");
}

function severityScore(segment) {
  const base = { closure: 400, bad: 300, watch: 200, unknown: 100, good: 0 }[segment.status] || 0;
  return base + Number(segment.ratio || 1);
}

function buildError(message) {
  return {
    level: "Traffic unavailable",
    mode: "watch",
    meter: 45,
    detail: message,
    updatedAt: new Date().toISOString(),
    segments: [],
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: HEADERS,
  });
}

function round(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
