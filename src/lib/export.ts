import type { MultiPolygon } from 'geojson';
import { ambientT } from '../i18n/translator';
import type { Translator } from '../i18n/translator';
import type { QAFlag, WField, Workspace } from '../types';
import { toMultiPolygon } from './geo';
import { fieldGeometries } from './qa';
import {
  type DbfFieldSpec,
  type ShapefileRow,
  buildShapefile,
  zipShapefile,
} from './shapefile';

/**
 * The CropForce schema, and nothing else. Names stay within the 10-character DBF
 * header limit; values get 30 bytes so real farm and field names survive intact.
 */
export const CROPFORCE_FIELDS: DbfFieldSpec[] = [
  { name: 'Client', length: 30 },
  { name: 'Farm', length: 30 },
  { name: 'Field', length: 30 },
];

export interface ExportRow extends ShapefileRow {
  fieldId: string;
  geometry: MultiPolygon;
}

export interface ExportPlan {
  rows: ExportRow[];
  /** Fields left out because they have no geometry at all. */
  skippedFieldIds: string[];
  /** Features that belong to no field and therefore are not written. */
  unassignedCount: number;
}

/**
 * Turns the workspace into export rows: one row per field, its member polygons
 * dissolved into a single MultiPolygon, whatever they were built from.
 */
export function planExport(workspace: Workspace): ExportPlan {
  const rows: ExportRow[] = [];
  const skippedFieldIds: string[] = [];

  for (const entry of fieldGeometries(workspace)) {
    if (!entry.geometry) {
      skippedFieldIds.push(entry.field.id);
      continue;
    }
    rows.push({
      fieldId: entry.field.id,
      geometry: toMultiPolygon(entry.geometry),
      attributes: attributesOf(entry.field),
    });
  }

  return {
    rows,
    skippedFieldIds,
    unassignedCount: workspace.features.filter((f) => f.fieldId === null).length,
  };
}

const attributesOf = (field: WField): Record<string, string> => ({
  Client: field.client.trim(),
  Farm: field.farm.trim(),
  Field: field.field.trim(),
});

export interface ExportBlockers {
  blocked: boolean;
  /** One line per problem, ready to show in the blocked-export dialog. */
  reasons: string[];
  warnings: string[];
}

export function exportBlockers(
  flags: QAFlag[],
  plan: ExportPlan,
  t: Translator = ambientT(),
): ExportBlockers {
  const reasons = flags.filter((f) => f.severity === 'blocking').map((f) => f.title);
  const warnings = flags.filter((f) => f.severity === 'warning').map((f) => f.title);
  if (plan.rows.length === 0) {
    reasons.unshift(t('export.noFields'));
  }
  return { blocked: reasons.length > 0, reasons, warnings };
}

/** Builds the zipped shapefile. Everything happens in memory in the browser. */
export async function buildExportZip(plan: ExportPlan, baseName: string): Promise<Blob> {
  const bundle = buildShapefile(plan.rows, CROPFORCE_FIELDS);
  return zipShapefile(bundle, baseName);
}

/**
 * Hands the file to the browser's download machinery. The object URL is revoked
 * straight after so nothing lingers in memory.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A filename that identifies the upload without carrying anything sensitive. */
export function suggestFileName(workspace: Workspace): string {
  const clients = new Set(
    workspace.fields.map((f) => f.client.trim()).filter((value) => value !== ''),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  const client = clients.size === 1 ? [...clients][0] : 'boundaries';
  const safe = client.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40) || 'boundaries';
  return `${safe}_cropforce_${stamp}`;
}
