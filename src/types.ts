import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type FeatureId = string;
export type FieldId = string;

/** Any polygonal geometry we hold in the workspace. Always WGS84 / EPSG:4326. */
export type PolyGeom = Polygon | MultiPolygon;
export type PolyFeature = Feature<PolyGeom>;

/**
 * A raw polygon as imported or drawn. Geometry is editable. A feature belongs to
 * at most one field; features with `fieldId === null` are "ungrouped" and are not
 * exported.
 */
export interface WFeature {
  id: FeatureId;
  geometry: PolyGeom;
  /** File the feature came from, or "Drawn" for hand-drawn polygons. */
  source: string;
  fieldId: FieldId | null;
  /** Original attributes from the source file, kept only to offer attribute mapping. */
  sourceProps: Record<string, unknown>;
  /**
   * Client/Farm/Field values carried over from the source file, honouring the mapping
   * the user chose at import. Used to pre-fill a new field's attributes when this
   * feature is grouped; empty when the user declined to carry attributes across.
   */
  seed: { client: string; farm: string; field: string };
}

/**
 * The CropForce unit: one field is one row in the exported attribute table and one
 * MultiPolygon, however many member features it is built from.
 */
export interface WField {
  id: FieldId;
  client: string;
  farm: string;
  field: string;
}

export interface Workspace {
  features: WFeature[];
  fields: WField[];
}

export const emptyWorkspace = (): Workspace => ({ features: [], fields: [] });

export type FlagSeverity = 'blocking' | 'warning';

export type FlagKind =
  | 'missing-attributes'
  | 'invalid-geometry'
  | 'overlap'
  | 'jagged-edges'
  | 'non-crop-area'
  | 'sliver'
  | 'naming'
  | 'unassigned'
  | 'empty-field';

/** How the "Fix manually" button should set the app up for hand-editing. */
export type ManualTool =
  | 'attributes'
  | 'vertex'
  | 'vertex-snap'
  | 'simplify'
  | 'cut-hole'
  | 'review-delete';

export interface QAFlag {
  /** Stable across recomputes so open/expanded state and "resolved" styling survive. */
  id: string;
  kind: FlagKind;
  severity: FlagSeverity;
  title: string;
  detail: string;
  /** Arva "What Makes a Good Field Boundary?" guidance shown as a tooltip. */
  guidance: string;
  featureIds: FeatureId[];
  fieldIds: FieldId[];
  /** Present when a programmatic correction is offered. */
  autoFix?: AutoFixSpec;
  manual: ManualTool;
}

export type AutoFixSpec =
  | { kind: 'unkink' }
  | { kind: 'delete-features' }
  | { kind: 'simplify'; toleranceMeters: number }
  | { kind: 'resolve-overlap' };

/** The editing tool currently armed in the map toolbar. */
export type Tool = 'select' | 'edit' | 'move' | 'draw' | 'cut-hole' | 'split' | 'simplify';

export type Basemap = 'imagery' | 'street';
