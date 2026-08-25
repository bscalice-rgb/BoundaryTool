import type { FieldId, QAFlag, Workspace } from '../types';
import { fieldGeometries } from './qa';

/**
 * The workspace as CropForce files it: Client, then Farm, then Field.
 *
 * The table is a flat list because that is what gets edited; this is the same data
 * read the way the destination organises it, which is how someone checks that a whole
 * client's holding arrived and that nothing is filed under a farm that does not exist.
 */
export interface FieldNode {
  id: FieldId;
  name: string;
  areaHa: number;
  polygons: number;
  featureIds: string[];
  blocking: number;
}

export interface FarmNode {
  name: string;
  areaHa: number;
  fields: FieldNode[];
  blocking: number;
}

export interface ClientNode {
  name: string;
  areaHa: number;
  farms: FarmNode[];
  fieldCount: number;
  blocking: number;
}

export interface Hierarchy {
  clients: ClientNode[];
  ungrouped: number;
  totalHa: number;
  totalFields: number;
}

/** Sorts by name, with the blank ones last: an empty group is not the place to start. */
const byName = (a: { name: string }, b: { name: string }): number => {
  if ((a.name === '') !== (b.name === '')) return a.name === '' ? 1 : -1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
};

export function buildHierarchy(workspace: Workspace, flags: QAFlag[]): Hierarchy {
  const blockingByField = new Map<FieldId, number>();
  for (const flag of flags) {
    if (flag.severity !== 'blocking') continue;
    for (const id of flag.fieldIds) {
      blockingByField.set(id, (blockingByField.get(id) ?? 0) + 1);
    }
  }

  const clients = new Map<string, Map<string, FieldNode[]>>();
  let totalHa = 0;

  for (const entry of fieldGeometries(workspace)) {
    const client = entry.field.client.trim();
    const farm = entry.field.farm.trim();
    const farms = clients.get(client) ?? new Map<string, FieldNode[]>();
    const fields = farms.get(farm) ?? [];

    fields.push({
      id: entry.field.id,
      name: entry.field.field.trim(),
      areaHa: entry.areaHa,
      polygons: entry.featureIds.length,
      featureIds: entry.featureIds,
      blocking: blockingByField.get(entry.field.id) ?? 0,
    });
    totalHa += entry.areaHa;

    farms.set(farm, fields);
    clients.set(client, farms);
  }

  const tree: ClientNode[] = [...clients.entries()]
    .map(([client, farms]) => {
      const farmNodes: FarmNode[] = [...farms.entries()]
        .map(([farm, fields]) => ({
          name: farm,
          fields: [...fields].sort(byName),
          areaHa: fields.reduce((sum, field) => sum + field.areaHa, 0),
          blocking: fields.reduce((sum, field) => sum + field.blocking, 0),
        }))
        .sort(byName);
      return {
        name: client,
        farms: farmNodes,
        areaHa: farmNodes.reduce((sum, farm) => sum + farm.areaHa, 0),
        fieldCount: farmNodes.reduce((sum, farm) => sum + farm.fields.length, 0),
        blocking: farmNodes.reduce((sum, farm) => sum + farm.blocking, 0),
      };
    })
    .sort(byName);

  return {
    clients: tree,
    ungrouped: workspace.features.filter((feature) => feature.fieldId === null).length,
    totalHa,
    totalFields: workspace.fields.length,
  };
}

/** The tree as indented text, for pasting into a mail or a ticket. */
export function hierarchyToText(
  tree: Hierarchy,
  labels: { client: string; farm: string; field: string },
): string {
  const lines: string[] = [];
  for (const client of tree.clients) {
    lines.push(client.name || labels.client);
    for (const farm of client.farms) {
      lines.push(`  ${farm.name || labels.farm}`);
      for (const field of farm.fields) {
        lines.push(`    ${field.name || labels.field}`);
      }
    }
  }
  return lines.join('\n');
}
