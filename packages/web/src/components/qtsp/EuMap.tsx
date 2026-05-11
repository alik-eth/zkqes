// Real-geography choropleth of EU + Ukraine using d3-geo (Mercator)
// + world-atlas TopoJSON (countries-110m). Pure SVG, no tile servers.
//
// Per /qtsps founder ask 2026-05-07: replace the schematic tile grid
// with a Mercator projection so users see actual borders. Click a
// country path → setCountryFilter; click again or the clear button
// → reset.

import { useMemo, useState } from 'react';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import worldTopo from 'world-atlas/countries-110m.json';

// ISO 3166-1 numeric → ISO 3166-1 alpha-2 used by eIDAS / our QTSP feed.
// world-atlas embeds numeric IDs as `id` (string) on each Feature.
// "EL" is Greece (eIDAS uses EL not GR), "UK" would be GB but the EU
// LOTL feed switched to ISO-A2 long ago — UK was dropped post-Brexit.
const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '040': 'AT', '056': 'BE', '100': 'BG', '196': 'CY', '203': 'CZ',
  '208': 'DK', '233': 'EE', '276': 'DE', '300': 'EL', // Greece
  '352': 'IS', '372': 'IE', '380': 'IT', '428': 'LV', '438': 'LI',
  '440': 'LT', '442': 'LU', '470': 'MT', '528': 'NL', '578': 'NO',
  '616': 'PL', '620': 'PT', '642': 'RO', '703': 'SK', '705': 'SI',
  '724': 'ES', '752': 'SE', '246': 'FI', '250': 'FR', '191': 'HR',
  '348': 'HU', '804': 'UA',
};

// world-atlas country IDs are stored as numbers OR string-padded numbers
// depending on version; normalise to 3-digit zero-padded string.
function normaliseId(id: string | number | undefined): string {
  if (id === undefined) return '';
  const s = String(id);
  return s.length < 3 ? s.padStart(3, '0') : s;
}

const SUPPORTED_ALPHA2 = new Set(Object.values(NUMERIC_TO_ALPHA2));

const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus', CZ: 'Czechia',
  DE: 'Germany', DK: 'Denmark', EE: 'Estonia', EL: 'Greece', ES: 'Spain',
  FI: 'Finland', FR: 'France', HR: 'Croatia', HU: 'Hungary', IE: 'Ireland',
  IS: 'Iceland', IT: 'Italy', LI: 'Liechtenstein', LT: 'Lithuania',
  LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta', NL: 'Netherlands', NO: 'Norway',
  PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SI: 'Slovenia',
  SK: 'Slovakia', UA: 'Ukraine',
};

// Mainland-France bounding box (lon, lat). Excludes French Guiana
// (~-53°W), Réunion (~55°E), Mayotte, Martinique, Guadeloupe — all of
// which are in the FR multipolygon and would otherwise drag the
// fitExtent so far that mainland Europe shrinks to a corner.
// Includes Corsica (which sits at ~9°E, 42°N).
const FR_MAINLAND_BBOX: [number, number, number, number] = [-5.5, 41, 10, 51.5];

// Mainland-Norway bounding box. Excludes Svalbard (3 polygons at
// 76-80°N in the world-atlas multipolygon) — those Arctic islands
// drag the projection's northern bound 1500km past where any QTSP
// activity happens. Norway proper + Bjørnøya area trims at ~72°N.
const NO_MAINLAND_BBOX: [number, number, number, number] = [3, 57, 32, 72];

function ringCentroid(ring: ReadonlyArray<readonly number[]>): readonly [number, number] {
  let lon = 0;
  let lat = 0;
  let n = 0;
  for (const pt of ring) {
    if (pt.length < 2) continue;
    lon += pt[0]!;
    lat += pt[1]!;
    n += 1;
  }
  return n === 0 ? [Number.NaN, Number.NaN] : [lon / n, lat / n];
}

function inBbox(lon: number, lat: number, bbox: readonly [number, number, number, number]): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/**
 * Drop any polygon in a MultiPolygon whose outer-ring centroid is
 * outside `bbox`. Used to strip France's overseas territories so the
 * Mercator projection only fits mainland France + Corsica.
 */
function clipMultiPolygonToBbox(
  geom: Polygon | MultiPolygon,
  bbox: readonly [number, number, number, number],
): Polygon | MultiPolygon {
  if (geom.type === 'Polygon') {
    const c = ringCentroid(geom.coordinates[0] ?? []);
    return inBbox(c[0], c[1], bbox) ? geom : { ...geom, coordinates: [] };
  }
  const kept = geom.coordinates.filter((poly) => {
    const c = ringCentroid(poly[0] ?? []);
    return inBbox(c[0], c[1], bbox);
  });
  return { ...geom, coordinates: kept };
}

/**
 * Re-attribute Crimea from RU to UA. world-atlas/countries-110m
 * (Natural Earth derived) hard-codes Crimea inside Russia's
 * MultiPolygon — specifically the polygon whose bounding box sits at
 * roughly 32.5°E–36.5°E, 44.4°N–46.2°N. We extract that polygon at
 * native topology resolution and append it to Ukraine's MultiPolygon
 * so the rendering matches Ukraine's de jure borders (Ukrainian law,
 * UN GA Resolution 68/262) without the lossy hand-drawn approximation
 * we'd otherwise need.
 *
 * Bbox match (rather than RU id 643 hard-coded) because Natural Earth
 * may rearrange polygon order across vintages — the bbox test is
 * stable: only Crimea sits inside that envelope under the RU label.
 */
const CRIMEA_BBOX: readonly [number, number, number, number] = [32.0, 44.0, 37.0, 46.5];

function ringFitsBbox(ring: ReadonlyArray<readonly number[]>, bbox: readonly [number, number, number, number]): boolean {
  for (const pt of ring) {
    if (pt.length < 2) continue;
    const lon = pt[0]!;
    const lat = pt[1]!;
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) return false;
  }
  return true;
}

function findCrimeaPolygon(
  features: ReadonlyArray<Feature<Polygon | MultiPolygon, unknown>>,
): Polygon['coordinates'] | null {
  for (const f of features) {
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const poly of polys) {
      const outer = poly[0];
      if (!outer) continue;
      if (ringFitsBbox(outer, CRIMEA_BBOX)) return poly;
    }
  }
  return null;
}

/**
 * UA mainland's outer ring in this Natural Earth vintage dips
 * deep into Crimea (points 27–32 are around 35°E, 45.7°N — well
 * inside the peninsula). When we then overlay the full Crimea
 * polygon, UA's southern-dip stroke shows through as a visible
 * horizontal "border" line across northern Crimea.
 *
 * Strip any outer-ring points that fall inside Crimea's bbox so
 * UA mainland ends at the Perekop / Sivash line; the appended
 * Crimea polygon takes over from there with no overlapping stroke.
 *
 * Inner rings (holes) are preserved as-is.
 */
// Tight enough that UA's Black Sea coast just W of Perekop (lon 33.30)
// and the Azov north shore (lat > 46.15) survive untouched. Only
// catches the points that genuinely sit inside the peninsula.
const UA_CRIMEA_EXCLUSION: readonly [number, number, number, number] = [33.4, 44.0, 36.6, 46.15];

function stripCrimeaFromUaMainland(geom: Polygon | MultiPolygon): Polygon | MultiPolygon {
  const stripRing = (ring: ReadonlyArray<readonly number[]>): number[][] =>
    ring
      .filter((pt) => {
        if (pt.length < 2) return true;
        const lon = pt[0]!;
        const lat = pt[1]!;
        return !(lon >= UA_CRIMEA_EXCLUSION[0] && lon <= UA_CRIMEA_EXCLUSION[2] &&
                 lat >= UA_CRIMEA_EXCLUSION[1] && lat <= UA_CRIMEA_EXCLUSION[3]);
      })
      .map((pt) => [...pt]);

  if (geom.type === 'Polygon') {
    const [outer, ...holes] = geom.coordinates;
    const newOuter = stripRing(outer ?? []);
    if (newOuter.length > 0 && newOuter[0] !== newOuter[newOuter.length - 1]) {
      newOuter.push([...newOuter[0]!]);
    }
    return { ...geom, coordinates: [newOuter, ...holes] };
  }
  return {
    ...geom,
    coordinates: geom.coordinates.map((poly) => {
      const [outer, ...holes] = poly;
      const newOuter = stripRing(outer ?? []);
      if (newOuter.length > 0 && newOuter[0] !== newOuter[newOuter.length - 1]) {
        newOuter.push([...newOuter[0]!]);
      }
      return [newOuter, ...holes];
    }),
  };
}

function addCrimeaToUkraine(
  uaGeom: Polygon | MultiPolygon,
  crimeaPoly: Polygon['coordinates'] | null,
): MultiPolygon {
  const cleaned = stripCrimeaFromUaMainland(uaGeom);
  const polys: Polygon['coordinates'][] =
    cleaned.type === 'MultiPolygon' ? [...cleaned.coordinates] : [cleaned.coordinates];
  if (crimeaPoly) polys.push(crimeaPoly);
  return { type: 'MultiPolygon', coordinates: polys };
}

export interface EuMapProps {
  /** country code (alpha-2) → aggregate */
  readonly byCountry: ReadonlyMap<string, { total: number; p256: number; rsa: number; supported: number; live: number }>;
  readonly selected: string;
  readonly onSelect: (cc: string) => void;
}

export function EuMap({ byCountry, selected, onSelect }: EuMapProps) {
  const features = useMemo(() => {
    const topo = worldTopo as unknown as Topology<{ countries: GeometryCollection }>;
    const fc = feature(topo, topo.objects.countries) as unknown as {
      features: ReadonlyArray<Feature<Polygon | MultiPolygon, { name?: string }>>;
    };
    // First pass: find Crimea anywhere (lives inside RU's MultiPolygon
    // in this vintage of world-atlas). Cached for the UA join below.
    const crimeaPoly = findCrimeaPolygon(fc.features);

    return fc.features
      .map((f) => {
        const cc = NUMERIC_TO_ALPHA2[normaliseId(f.id as string | number | undefined)];
        if (!cc || !SUPPORTED_ALPHA2.has(cc)) return null;

        // Per-country geometry tweaks:
        //  - FR: strip overseas (Guiana / Réunion / Caribbean) so
        //    fitExtent fits mainland Europe, not the equator.
        //  - NO: strip Svalbard so the projection's northern bound
        //    stops at mainland Norway, not 80°N.
        //  - UA: re-attribute Crimea from RU's polygon so UA renders
        //    with its de jure borders.
        let geom: Polygon | MultiPolygon = f.geometry;
        if (cc === 'FR') {
          geom = clipMultiPolygonToBbox(geom, FR_MAINLAND_BBOX);
        } else if (cc === 'NO') {
          geom = clipMultiPolygonToBbox(geom, NO_MAINLAND_BBOX);
        } else if (cc === 'UA') {
          geom = addCrimeaToUkraine(geom, crimeaPoly);
        }
        const trimmed = { ...f, geometry: geom };
        return { feature: trimmed, cc };
      })
      .filter((x): x is { feature: Feature<Polygon | MultiPolygon, { name?: string }>; cc: string } => x !== null);
  }, []);

  // Width-driven sizing. Project once into a generous canvas, measure
  // the actual bounding box of the painted features, then crop the
  // viewBox to that bbox. SVG `width="100%"` + viewBox = browser
  // computes height from the projection's natural aspect — no
  // ResizeObserver, no fixed container aspect, scales 1:1 to whatever
  // width the parent gives it.
  const { path, viewBox, width, height, originX, originY } = useMemo(() => {
    const canvasW = 1000;
    const canvasH = 1000;
    const pad = 12;
    // Albers Equal Area Conic — preserves area (Sweden/Finland no
    // longer Mercator-stretched 2× wider than reality). Standard EU
    // parallels per ETRS-LAEA / Eurostat: 40°N and 65°N. Rotate by
    // −15° so the central meridian sits over the EU's centre of mass
    // (Czechia/Austria), keeping the conic's "fair" arc through the
    // most populated band.
    const projection = geoConicEqualArea()
      .parallels([40, 65])
      .rotate([-15, 0]);
    const collection: GeoJSON.FeatureCollection<Polygon | MultiPolygon> = {
      type: 'FeatureCollection',
      features: features.map((x) => x.feature),
    };
    projection.fitExtent([[pad, pad], [canvasW - pad, canvasH - pad]], collection);
    const pathGen = geoPath(projection);
    const [[minX, minY], [maxX, maxY]] = pathGen.bounds(collection);
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const vb = `${minX - pad} ${minY - pad} ${w} ${h}`;
    return { path: pathGen, viewBox: vb, width: w, height: h, originX: minX - pad, originY: minY - pad };
  }, [features]);

  const [hover, setHover] = useState<{
    cc: string;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', background: 'var(--cv-card)' }}
      role="img"
      aria-label="Choropleth map of EU + Ukraine QTSP coverage"
      onMouseLeave={() => setHover(null)}
    >
      {/* sea / page bg with a subtle hatched fill behind the map */}
      <defs>
        <pattern id="eu-sea-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0, 87, 183, 0.08)" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect x={originX} y={originY} width={width} height={height} fill="url(#eu-sea-hatch)" />

      {features.map(({ feature: f, cc }) => {
        const agg = byCountry.get(cc) ?? { total: 0, p256: 0, rsa: 0, supported: 0, live: 0 };
        const isSelected = selected === cc;
        const hasAny = agg.total > 0;
        const hasSupported = agg.supported > 0;
        const hasLive = agg.live > 0;
        // V7 supports both ECDSA-P-256 and RSA-2048; the choropleth no
        // longer separates the two ("queued" tier collapses into the
        // supported tier). Live > supported > unsupported.
        const fill = !hasAny
          ? '#e8e2d2'
          : hasLive
            ? 'var(--cv-ua-blue)'
            : hasSupported
              ? 'var(--cv-ua-yellow)'
              : 'var(--cv-card)';
        const stroke = isSelected ? 'var(--cv-ua-blue)' : 'var(--cv-ink)';
        const strokeWidth = isSelected ? 3 : 1.25;
        const d = path(f) ?? '';
        const centroid = path.centroid(f);
        return (
          <g
            key={cc}
            style={{ cursor: hasAny ? 'pointer' : 'default' }}
            onClick={() => hasAny && onSelect(isSelected ? '' : cc)}
            onMouseEnter={(e) => setHover({ cc, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setHover({ cc, x: e.clientX, y: e.clientY })}
          >
            <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            {hasAny && Number.isFinite(centroid[0]) && (
              <text
                x={centroid[0]}
                y={centroid[1]}
                textAnchor="middle"
                fontFamily="var(--cv-mono)"
                fontSize="10"
                fontWeight="700"
                fill={hasLive ? '#fff' : 'var(--cv-ink)'}
                style={{ pointerEvents: 'none' }}
              >
                {cc}
              </text>
            )}
          </g>
        );
      })}
    </svg>
    {hover && <Tooltip cc={hover.cc} x={hover.x} y={hover.y} byCountry={byCountry} />}
    </div>
  );
}

function Tooltip({ cc, x, y, byCountry }: {
  cc: string; x: number; y: number;
  byCountry: ReadonlyMap<string, { total: number; p256: number; rsa: number; supported: number; live: number }>;
}) {
  const agg = byCountry.get(cc) ?? { total: 0, p256: 0, rsa: 0, supported: 0, live: 0 };
  const name = COUNTRY_NAMES[cc] ?? cc;
  const status = agg.live > 0
    ? { label: 'LIVE INTEGRATION', color: 'var(--cv-ua-yellow)' }
    : agg.supported > 0
      ? { label: 'SUPPORTED · RSA + P-256', color: 'var(--cv-ua-blue)' }
      : agg.total > 0
        ? { label: 'NEEDS PER-COUNTRY REVIEW', color: 'var(--cv-mute)' }
        : { label: 'NOT IN SUPPORTED SET', color: 'var(--cv-mute)' };
  // Position tooltip in viewport coords, offset slightly so it doesn't
  // sit under the cursor; flip to left side when too close to right edge.
  const flipLeft = typeof window !== 'undefined' && x > window.innerWidth - 280;
  const style: React.CSSProperties = {
    position: 'fixed',
    left: flipLeft ? x - 270 : x + 16,
    top: Math.max(8, y - 8),
    minWidth: 240,
    maxWidth: 260,
    padding: '10px 12px',
    background: 'var(--cv-card)',
    border: '2px solid var(--cv-ink)',
    boxShadow: '4px 4px 0 var(--cv-ink)',
    fontFamily: 'var(--cv-mono)',
    fontSize: 12,
    color: 'var(--cv-ink)',
    pointerEvents: 'none',
    zIndex: 100,
    lineHeight: 1.45,
  };
  return (
    <div style={style}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6,
        borderBottom: '1.5px dashed var(--cv-ink)', paddingBottom: 4,
      }}>
        <span style={{
          fontFamily: 'var(--cv-display)', fontSize: 18, color: 'var(--cv-ua-blue)', fontWeight: 700,
        }}>{cc}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
      </div>
      <div style={{
        fontSize: 9.5, letterSpacing: '.14em', fontWeight: 700,
        color: status.color, marginBottom: 8,
      }}>
        ● {status.label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 3, columnGap: 10, fontSize: 11.5 }}>
        <span style={{ color: 'var(--cv-mute)' }}>QTSPs total</span>
        <span style={{ textAlign: 'right', fontWeight: 600 }}>{agg.total}</span>
        <span style={{ color: 'var(--cv-mute)' }}>ECDSA P-256</span>
        <span style={{ textAlign: 'right', fontWeight: 600, color: agg.p256 > 0 ? 'var(--cv-ua-blue)' : 'var(--cv-mute)' }}>
          {agg.p256}
        </span>
        <span style={{ color: 'var(--cv-mute)' }}>RSA-2048</span>
        <span style={{ textAlign: 'right', fontWeight: 600, color: agg.rsa > 0 ? 'var(--cv-ua-blue)' : 'var(--cv-mute)' }}>
          {agg.rsa}
        </span>
        <span style={{ color: 'var(--cv-mute)' }}>live integration</span>
        <span style={{ textAlign: 'right', fontWeight: 600, color: agg.live > 0 ? '#2e7d32' : 'var(--cv-mute)' }}>
          {agg.live > 0 ? `✓ ${agg.live}` : '—'}
        </span>
      </div>
      <div style={{
        marginTop: 8, paddingTop: 6, borderTop: '1.5px dashed var(--cv-ink)',
        fontSize: 10, color: 'var(--cv-mute)', letterSpacing: '.04em',
      }}>
        {agg.total === 0
          ? 'No data — not currently in the supported trust list.'
          : 'Click to filter the table below to this country.'}
      </div>
    </div>
  );
}
