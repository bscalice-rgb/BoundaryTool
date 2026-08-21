import { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import type { BBox, LineString, Polygon, Position } from 'geojson';
import type { Basemap, FeatureId, PolyGeom, Tool, WFeature, Workspace } from '../types';
import { useT } from '../i18n';
import type { Translator } from '../i18n';
import { areaHa, formatHa } from '../lib/geo';

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const ESRI_ATTRIBUTION =
  'Imagery &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, ' +
  'Earthstar Geographics, and the GIS User Community';

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SNAP_DISTANCE = 18;

/** Deeper than this, upscaled tiles are too soft to trace against. */
const MAX_ZOOM = 20;

/** Field names appear from here in; further out they would overlap into a smear. */
const LABEL_MIN_ZOOM = 14;

export interface FocusRequest {
  bbox: BBox;
  /** Bumped on every request so repeating the same zoom still fires. */
  nonce: number;
}

/**
 * Builds the "zoom to my location" control. It is a real Leaflet control rather than a
 * floating React button so it stacks with the zoom buttons and inherits their styling.
 */
function locateControl(onClick: () => void): L.Control {
  const control = new L.Control({ position: 'topleft' });
  control.onAdd = () => {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-icon-control locate-control');
    const link = L.DomUtil.create('a', '', container);
    link.href = '#';
    link.setAttribute('role', 'button');
    // Wording is filled in by the effect that follows the language picker.
    link.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="3.2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(link, 'click', (event) => {
      L.DomEvent.stop(event);
      onClick();
    });
    return container;
  };
  return control;
}

/** The browser's own view of whether this site may use geolocation, where it exposes one. */
async function permissionState(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return status?.state ?? null;
  } catch {
    // Safari and older browsers do not report on geolocation; the request still works.
    return null;
  }
}

/**
 * Turns a geolocation failure into something worth reading. The browser's own message
 * ("position update is unavailable") tells a user nothing about what to do next.
 */
function describeLocationError(event: L.ErrorEvent, t: Translator): string {
  const detail = event.message
    ? ` (${event.message.replace(/^Geolocation error:\s*/i, '').replace(/\.$/, '')})`
    : '';
  switch (event.code) {
    case 1:
      return t('map.error.denied');
    case 3:
      return t('map.error.timeout');
    default:
      return t('map.error.unavailable', { detail });
  }
}

/**
 * The "go to coordinates" control. It is the fallback for the very common case of a
 * desktop browser that cannot work out where it is: the user says where instead.
 */
function coordinateControl(onClick: () => void): L.Control {
  const control = new L.Control({ position: 'topleft' });
  control.onAdd = () => {
    const container = L.DomUtil.create(
      'div',
      'leaflet-bar leaflet-control map-icon-control coordinates-control',
    );
    const link = L.DomUtil.create('a', '', container);
    link.href = '#';
    link.setAttribute('role', 'button');
    link.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M8 14.5s5-4.6 5-8.2A5 5 0 0 0 3 6.3c0 3.6 5 8.2 5 8.2z"/>' +
      '<circle cx="8" cy="6.2" r="1.8"/></svg>';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(link, 'click', (event) => {
      L.DomEvent.stop(event);
      onClick();
    });
    return container;
  };
  return control;
}

export interface MapViewProps {
  workspace: Workspace;
  selection: ReadonlySet<FeatureId>;
  tool: Tool;
  snapping: boolean;
  basemap: Basemap;
  colorFor: (feature: WFeature) => string;
  /** Geometry shown as a dashed overlay while the smoothing slider is open. */
  preview: { featureId: FeatureId; geometry: PolyGeom }[] | null;
  focus: FocusRequest | null;
  /** Boundaries to light up without selecting — a flag being pointed at, usually. */
  hoverFeatureIds: ReadonlySet<FeatureId>;
  onHoverFeatures: (ids: FeatureId[]) => void;
  /** Names drawn on the map once it is zoomed in far enough for them to fit. */
  labelFor: (feature: WFeature) => string;
  onSelect: (featureId: FeatureId | null, additive: boolean) => void;
  onDrawPolygon: (geometry: Polygon) => void;
  onCutHole: (geometry: Polygon) => void;
  onSplitLine: (line: LineString) => void;
  onGeometryEdited: (featureId: FeatureId, geometry: PolyGeom) => void;
  /** Surfaced when the browser refuses or fails to report a position. */
  onLocationError: (message: string) => void;
  /** A message while a position is being fetched, or null once it settles. */
  onLocatingChange: (hint: string | null) => void;
  /** Opens the "go to coordinates" prompt, which lives in the app's dialog layer. */
  onOpenCoordinates: () => void;
  /** A position to centre on, set when the user confirms a coordinate jump. */
  goTo: { position: Position; nonce: number } | null;
}

export default function MapView(props: MapViewProps) {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef(new Map<FeatureId, L.Polygon>());
  /** Geometry object each layer was drawn from, so only real changes force a redraw. */
  const drawnFromRef = useRef(new Map<FeatureId, PolyGeom>());
  /**
   * Features whose latest geometry came out of the layer itself. Rebuilding those
   * would tear down the Geoman editing session the user is in the middle of.
   */
  const selfEditedRef = useRef(new Set<FeatureId>());
  const previewLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayersRef = useRef<Partial<Record<Basemap, L.TileLayer>>>({});
  const didFitRef = useRef(false);
  /** The "you are here" dot and its accuracy ring, replaced on each locate. */
  const locationLayerRef = useRef<L.LayerGroup | null>(null);
  /** Which locate attempt is in flight, so the coarse one can be retried precisely. */
  const locateAttemptRef = useRef<'idle' | 'coarse' | 'precise'>('idle');

  // Handlers are read through a ref so Leaflet callbacks never close over stale props.
  const propsRef = useRef(props);
  propsRef.current = props;

  /* ---------------------------------------------------------------- set-up */

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [50.5, 4.5],
      zoom: 5,
      maxZoom: MAX_ZOOM,
      zoomControl: true,
      preferCanvas: false,
      // Shift-drag is claimed by box zoom by default, which fights with selection.
      boxZoom: false,
    });
    mapRef.current = map;

    // Esri's imagery is not equally deep everywhere: past its coverage it serves a grey
    // "Map data not yet available" tile rather than nothing, which looks like a broken
    // map. Capping the native zoom at 18 — a level it has almost worldwide — means deeper
    // views upscale real imagery instead. OSM tiles are drawn to 19 and can go one closer.
    tileLayersRef.current = {
      imagery: L.tileLayer(ESRI_IMAGERY, {
        attribution: ESRI_ATTRIBUTION,
        maxZoom: MAX_ZOOM,
        maxNativeZoom: 18,
      }),
      street: L.tileLayer(OSM_TILES, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: MAX_ZOOM,
        maxNativeZoom: 19,
      }),
    };
    tileLayersRef.current.imagery!.addTo(map);

    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    /**
     * Asks for a position. Leaflet wraps navigator.geolocation; nothing is sent anywhere
     * by the app and the position never leaves this tab.
     *
     * The first attempt is deliberately coarse. Asking for high accuracy makes a desktop
     * browser go looking for GPS hardware that is not there, and several of them answer
     * POSITION_UNAVAILABLE outright rather than falling back to network positioning —
     * which is far more precision than "show me roughly where I am" needs anyway. If the
     * coarse attempt fails, the precise one is worth a try: on a phone with no network
     * location, GPS is exactly what does work.
     */
    const startLocate = (precise: boolean, hint: string) => {
      locateAttemptRef.current = precise ? 'precise' : 'coarse';
      map.getContainer().classList.add('locating');
      propsRef.current.onLocatingChange(hint);
      map.locate({
        setView: true,
        maxZoom: 16,
        enableHighAccuracy: precise,
        // The clock starts when the call is made, and on a first visit it runs while the
        // browser's own permission prompt is sitting on screen waiting to be clicked.
        // Anything short enough to feel responsive gives up before the user has answered.
        timeout: precise ? 25_000 : 30_000,
        maximumAge: precise ? 0 : 60_000,
      });
    };

    const finishLocate = (message: string | null) => {
      locateAttemptRef.current = 'idle';
      map.getContainer().classList.remove('locating');
      propsRef.current.onLocatingChange(null);
      if (message) propsRef.current.onLocationError(message);
    };

    locateControl(() => {
      void (async () => {
        if (!('geolocation' in navigator)) {
          finishLocate(tRef.current('map.error.unsupported'));
          return;
        }
        if (!window.isSecureContext) {
          finishLocate(tRef.current('map.error.insecure'));
          return;
        }

        // Asking the Permissions API first turns a silent 30-second wait into either an
        // immediate answer or an accurate hint about what the browser is about to do.
        const state = await permissionState();
        if (state === 'denied') {
          finishLocate(tRef.current('map.error.blocked'));
          return;
        }
        startLocate(
          false,
          tRef.current(state === 'prompt' ? 'map.locatingPrompt' : 'map.locating'),
        );
      })();
    }).addTo(map);

    coordinateControl(() => propsRef.current.onOpenCoordinates()).addTo(map);

    map.on('locationfound', (event: L.LocationEvent) => {
      finishLocate(null);
      locationLayerRef.current?.remove();
      locationLayerRef.current = L.layerGroup([
        L.circle(event.latlng, {
          radius: Math.max(event.accuracy, 5),
          className: 'location-accuracy',
          color: '#38bdf8',
          weight: 1,
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          interactive: false,
        }),
        L.circleMarker(event.latlng, {
          radius: 5,
          className: 'location-dot',
          color: '#ffffff',
          weight: 2,
          fillColor: '#38bdf8',
          fillOpacity: 1,
          interactive: false,
        }),
      ]).addTo(map);
    });

    map.on('locationerror', (event: L.ErrorEvent) => {
      // Escalating to high accuracy only helps where there is a GPS the coarse lookup did
      // not consult. A timeout must NOT escalate: on a laptop with no GPS, asking for high
      // accuracy is the surest way to turn "slow" into "impossible".
      if (locateAttemptRef.current === 'coarse' && event.code === 2) {
        startLocate(true, tRef.current('map.locatingPrecise'));
        return;
      }
      finishLocate(describeLocationError(event, tRef.current));
    });

    map.pm.setGlobalOptions({ snappable: true, snapDistance: SNAP_DISTANCE });

    map.on('click', () => {
      // Clicks that are placing vertices belong to the drawing, not to selection.
      if (map.pm.globalDrawModeEnabled()) return;
      propsRef.current.onSelect(null, false);
    });

    map.on('pm:create', (event: { layer: L.Layer; shape: string }) => {
      const layer = event.layer as L.Polygon | L.Polyline;
      const geojson = layer.toGeoJSON() as GeoJSON.Feature;
      // Geoman drops the drawn layer straight onto the map; React owns rendering,
      // so it comes off again and the geometry goes into the workspace instead.
      map.removeLayer(layer);

      const current = propsRef.current;
      if (event.shape === 'Line') {
        current.onSplitLine(geojson.geometry as LineString);
      } else if (current.tool === 'cut-hole') {
        current.onCutHole(geojson.geometry as Polygon);
      } else {
        current.onDrawPolygon(geojson.geometry as Polygon);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current.clear();
      drawnFromRef.current.clear();
    };
  }, []);

  /* ------------------------------------------------------------- basemap */

  useEffect(() => {
    const map = mapRef.current;
    const tiles = tileLayersRef.current;
    if (!map || !tiles.imagery || !tiles.street) return;
    const wanted = props.basemap === 'imagery' ? tiles.imagery : tiles.street;
    const other = props.basemap === 'imagery' ? tiles.street : tiles.imagery;
    if (map.hasLayer(other)) map.removeLayer(other);
    if (!map.hasLayer(wanted)) wanted.addTo(map);
    wanted.bringToBack();
  }, [props.basemap]);

  /* --------------------------------------------------------- feature layers */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;
    const drawnFrom = drawnFromRef.current;
    const live = new Set<FeatureId>();

    for (const feature of props.workspace.features) {
      live.add(feature.id);
      const existing = layers.get(feature.id);
      const geometryChanged = drawnFrom.get(feature.id) !== feature.geometry;

      if (existing && geometryChanged && selfEditedRef.current.has(feature.id)) {
        // The change came from this very layer; keep the editing session alive.
        selfEditedRef.current.delete(feature.id);
        drawnFrom.set(feature.id, feature.geometry);
        applyStyle(existing, feature, props.selection.has(feature.id), props.colorFor(feature));
        continue;
      }

      if (existing && !geometryChanged) {
        applyStyle(existing, feature, props.selection.has(feature.id), props.colorFor(feature));
        continue;
      }

      if (existing) {
        existing.remove();
        layers.delete(feature.id);
      }

      // geometryToLayer yields a single L.Polygon rather than the LayerGroup L.geoJSON
      // returns, which is what Geoman's per-layer edit and drag API expects.
      const layer = L.GeoJSON.geometryToLayer({
        type: 'Feature',
        properties: {},
        geometry: feature.geometry,
      } as GeoJSON.Feature) as L.Polygon;

      layer.on('mouseover', () => propsRef.current.onHoverFeatures([feature.id]));
      layer.on('mouseout', () => propsRef.current.onHoverFeatures([]));

      layer.on('click', (event: L.LeafletMouseEvent) => {
        // While a draw mode is running the click is placing a vertex. Swallowing it here
        // would make it impossible to draw over an existing polygon, which is exactly what
        // cutting an exclusion zone out of one requires.
        if (map.pm.globalDrawModeEnabled()) return;
        L.DomEvent.stopPropagation(event);
        const original = event.originalEvent;
        propsRef.current.onSelect(feature.id, original.shiftKey || original.ctrlKey || original.metaKey);
      });

      const commit = () => {
        const geometry = layer.toGeoJSON().geometry as PolyGeom;
        if (!geometry) return;
        selfEditedRef.current.add(feature.id);
        propsRef.current.onGeometryEdited(feature.id, geometry);
      };
      // Committing on each vertex change keeps the area readout and QA live, and
      // means nothing is lost if the user exports without leaving edit mode.
      for (const event of [
        'pm:update',
        'pm:dragend',
        'pm:markerdragend',
        'pm:vertexadded',
        'pm:vertexremoved',
      ]) {
        layer.on(event, commit);
      }

      layer.addTo(map);
      layers.set(feature.id, layer);
      drawnFrom.set(feature.id, feature.geometry);
      applyStyle(layer, feature, props.selection.has(feature.id), props.colorFor(feature));
    }

    for (const [id, layer] of layers) {
      if (live.has(id)) continue;
      layer.remove();
      layers.delete(id);
      drawnFrom.delete(id);
    }

    // First data to arrive frames itself; later imports leave the view alone so the
    // map does not jump around while the user is working. The framing is deliberately
    // not animated: a user who zooms to a feature a moment later would otherwise have
    // their view yanked back when this animation lands on top of it.
    if (!didFitRef.current && props.workspace.features.length > 0) {
      didFitRef.current = true;
      const bounds = L.latLngBounds([]);
      for (const layer of layers.values()) bounds.extend(layer.getBounds());
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: false });
      }
    }
    if (props.workspace.features.length === 0) didFitRef.current = false;
  }, [props.workspace, props.selection, props.colorFor]);

  /* ------------------------------------------------------------- tool modes */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.pm.disableDraw();
    map.pm.setGlobalOptions({ snappable: props.snapping, snapDistance: SNAP_DISTANCE });

    if (props.tool === 'draw' || props.tool === 'cut-hole') {
      map.pm.enableDraw('Polygon', {
        snappable: props.snapping,
        snapDistance: SNAP_DISTANCE,
        continueDrawing: false,
        finishOn: 'dblclick',
        allowSelfIntersection: false,
        templineStyle: { color: '#facc15' },
        hintlineStyle: { color: '#facc15', dashArray: '4,4' },
        pathOptions: {
          color: props.tool === 'cut-hole' ? '#f87171' : '#facc15',
          fillOpacity: 0.25,
        },
      });
    } else if (props.tool === 'split') {
      map.pm.enableDraw('Line', {
        snappable: props.snapping,
        snapDistance: SNAP_DISTANCE,
        continueDrawing: false,
        finishOn: 'dblclick',
        templineStyle: { color: '#f87171' },
        hintlineStyle: { color: '#f87171', dashArray: '4,4' },
      });
    }

    return () => {
      map.pm.disableDraw();
    };
  }, [props.tool, props.snapping]);

  /* -------------------------------------------------------- per-layer editing */

  useEffect(() => {
    if (!mapRef.current) return;
    for (const [id, layer] of layersRef.current) {
      layer.pm.disable();
      if (layer.pm.layerDragEnabled()) layer.pm.disableLayerDrag();
      if (!props.selection.has(id)) continue;

      if (props.tool === 'edit') {
        layer.pm.enable({
          allowSelfIntersection: false,
          snappable: props.snapping,
          snapDistance: SNAP_DISTANCE,
          draggable: false,
        });
      } else if (props.tool === 'move') {
        layer.pm.enableLayerDrag();
      }
    }
  }, [props.tool, props.snapping, props.selection, props.workspace]);

  /* ------------------------------------------------------------- hover */

  // Pointing is not selecting, so this only adds a class: no restyle, no state change,
  // nothing that survives the pointer leaving.
  useEffect(() => {
    for (const [id, layer] of layersRef.current) {
      const element = (layer as unknown as { _path?: SVGPathElement })._path;
      element?.classList.toggle('feature-hover', props.hoverFeatureIds.has(id));
    }
  }, [props.hoverFeatureIds, props.workspace]);

  /* ------------------------------------------------------------ labels */

  // Field names on the map, but only once there is room for them: at a whole-farm zoom
  // they would be a wall of overlapping text over the imagery being traced.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // A layer carries one tooltip, so the two uses take turns: the name once there is
    // room for it, and the area on hover the rest of the time.
    const paint = () => {
      const show = map.getZoom() >= LABEL_MIN_ZOOM;
      for (const feature of propsRef.current.workspace.features) {
        const layer = layersRef.current.get(feature.id);
        if (!layer) continue;
        const area = `${formatHa(areaHa(feature.geometry))} ha`;
        const label = propsRef.current.labelFor(feature);
        layer.unbindTooltip();
        if (show && label !== '') {
          layer.bindTooltip(`${label} · ${area}`, {
            permanent: true,
            direction: 'center',
            className: 'field-label',
            opacity: 1,
          });
        } else {
          layer.bindTooltip(area, {
            className: 'measure-tooltip',
            sticky: true,
            direction: 'top',
          });
        }
      }
    };

    paint();
    map.on('zoomend', paint);
    return () => {
      map.off('zoomend', paint);
    };
  }, [props.workspace, props.labelFor]);

  /* ------------------------------------------------- control wording */

  // The two icon controls are built once by Leaflet, so their wording is written in
  // afterwards and rewritten whenever the language changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const describe = (selector: string, label: string, title: string) => {
      const link = map.getContainer().querySelector<HTMLAnchorElement>(selector);
      if (!link) return;
      link.setAttribute('aria-label', label);
      link.title = title;
    };
    describe('.locate-control a', t('map.locate'), t('map.locateHint'));
    describe('.coordinates-control a', t('map.coordinates'), t('map.coordinatesHint'));
  }, [t]);

  /* ------------------------------------------------------- simplify preview */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    previewLayerRef.current?.remove();
    previewLayerRef.current = null;
    if (!props.preview || props.preview.length === 0) return;

    const layer = L.geoJSON(
      {
        type: 'FeatureCollection',
        features: props.preview.map((item) => ({
          type: 'Feature' as const,
          properties: {},
          geometry: item.geometry,
        })),
      } as GeoJSON.FeatureCollection,
      {
        pmIgnore: true,
        interactive: false,
        style: { color: '#facc15', weight: 2.5, fillOpacity: 0.08, dashArray: '5,4' },
      },
    );
    layer.addTo(map);
    layer.bringToFront();
    previewLayerRef.current = layer;
  }, [props.preview]);

  /* ------------------------------------------------------ coordinate jump */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.goTo) return;
    const [lon, lat] = props.goTo.position;
    map.setView([lat, lon], Math.max(map.getZoom(), 15));

    // The same marker the locate button drops, so a jump reads the same as a fix.
    locationLayerRef.current?.remove();
    locationLayerRef.current = L.layerGroup([
      L.circleMarker([lat, lon], {
        radius: 5,
        className: 'location-dot',
        color: '#ffffff',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 1,
        interactive: false,
      }),
    ]).addTo(map);
  }, [props.goTo]);

  /* ---------------------------------------------------------------- focus */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.focus) return;
    const [minX, minY, maxX, maxY] = props.focus.bbox;
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return;
    map.fitBounds(
      L.latLngBounds([
        [minY, minX],
        [maxY, maxX],
      ]),
      { padding: [80, 80], maxZoom: MAX_ZOOM - 2 },
    );
  }, [props.focus]);

  /* ---------------------------------------------------------------- render */

  return <div ref={containerRef} className="h-full w-full" />;
}

/* -------------------------------------------------------------------------- */

function applyStyle(
  layer: L.Polygon,
  feature: WFeature,
  selected: boolean,
  color: string,
): void {
  layer.setStyle({
    color: selected ? '#ffffff' : color,
    weight: selected ? 3 : 2,
    opacity: 1,
    fillColor: color,
    fillOpacity: selected ? 0.4 : feature.fieldId ? 0.22 : 0.1,
    dashArray: feature.fieldId ? undefined : '6,4',
  });
}
