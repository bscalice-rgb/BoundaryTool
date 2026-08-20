import { useState } from 'react';
import type { WField, Workspace } from '../types';
import type { ImportReport } from '../lib/import';
import { availableAttributeSources } from '../lib/import';
import type { AttributeMapping } from '../state/ops';
import type { ExportBlockers, ExportPlan } from '../lib/export';
import { describeField } from '../lib/qa';
import { Button, Modal } from './ui';

/* -------------------------------------------------------------------------- */
/* Import: attribute mapping                                                   */
/* -------------------------------------------------------------------------- */

export function ImportDialog({
  report,
  onConfirm,
  onCancel,
}: {
  report: ImportReport;
  onConfirm: (mapping: AttributeMapping) => void;
  onCancel: () => void;
}) {
  const available = availableAttributeSources(report.features.map((f) => f.sourceProps));
  const anyAvailable = available.client || available.farm || available.field;
  const [mapping, setMapping] = useState<AttributeMapping>(available);

  const sources = [...new Set(report.features.map((f) => f.source))];

  return (
    <Modal title="Import boundaries" onClose={onCancel}>
      <p className="text-xs leading-relaxed text-ink-300">
        Read {report.features.length} polygon{report.features.length === 1 ? '' : 's'} from{' '}
        {sources.length} file{sources.length === 1 ? '' : 's'}.
      </p>

      <ul className="mt-2 space-y-0.5">
        {sources.map((source) => (
          <li key={source} className="flex items-center gap-2 text-[11px] text-ink-400">
            <span className="h-1 w-1 rounded-full bg-ink-600" />
            <span className="truncate">{source}</span>
            <span className="ml-auto tabular-nums">
              {report.features.filter((f) => f.source === source).length}
            </span>
          </li>
        ))}
      </ul>

      {report.notes.length > 0 && (
        <div className="mt-3 rounded-md border border-ink-700 bg-ink-950/60 p-2.5">
          <h3 className="mb-1 text-[11px] font-semibold text-ink-300">Notes</h3>
          <ul className="space-y-1">
            {report.notes.map((note) => (
              <li key={note} className="text-[11px] leading-relaxed text-ink-400">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.errors.length > 0 && (
        <div className="mt-3 rounded-md border border-red-800/60 bg-red-950/40 p-2.5">
          <h3 className="mb-1 text-[11px] font-semibold text-red-200">Could not be read</h3>
          <ul className="space-y-1">
            {report.errors.map((error) => (
              <li key={error} className="text-[11px] leading-relaxed text-red-200/85">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.features.length > 0 && (
        <fieldset className="mt-4">
          <legend className="text-[11px] font-semibold text-ink-100">
            Carry attributes across
          </legend>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
            {anyAvailable
              ? 'These files already carry values that look like Client, Farm or Field names. ' +
                'Polygons that end up with matching values are grouped into one field, ready ' +
                'for you to check.'
              : 'No Client, Farm or Field values were found in these files, so every polygon ' +
                'arrives ungrouped for you to group and name.'}
          </p>
          <div className="mt-2 space-y-1.5">
            {(['client', 'farm', 'field'] as const).map((key) => (
              <label
                key={key}
                className={`flex items-center gap-2 text-xs ${
                  available[key] ? 'text-ink-100' : 'cursor-not-allowed text-ink-600'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!available[key]}
                  checked={mapping[key] && available[key]}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [key]: event.target.checked }))
                  }
                  className="h-3.5 w-3.5 accent-crop-500"
                />
                <span className="capitalize">{key}</span>
                {!available[key] && <span className="text-[10px]">not found in these files</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          tone="primary"
          disabled={report.features.length === 0}
          onClick={() => onConfirm(mapping)}
        >
          Add to workspace
        </Button>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Overlap resolution                                                          */
/* -------------------------------------------------------------------------- */

export function OverlapDialog({
  fields,
  workspace,
  onResolve,
  onCancel,
}: {
  fields: [WField, WField];
  workspace: Workspace;
  onResolve: (keeperId: string, loserId: string) => void;
  onCancel: () => void;
}) {
  const [keeperId, setKeeperId] = useState(fields[0].id);
  const loser = fields.find((field) => field.id !== keeperId)!;

  return (
    <Modal title="Resolve overlap" onClose={onCancel} width="max-w-md">
      <p className="text-xs leading-relaxed text-ink-300">
        Choose which field keeps the shared area. The overlap is then clipped out of the other
        one, leaving the two fields conjoined along a shared edge with no double-counted area.
      </p>

      <div className="mt-3 space-y-1.5">
        {fields.map((field) => (
          <label
            key={field.id}
            className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5
              ${
                keeperId === field.id
                  ? 'border-crop-400 bg-crop-500/10'
                  : 'border-ink-700 hover:border-ink-600'
              }`}
          >
            <input
              type="radio"
              name="keeper"
              checked={keeperId === field.id}
              onChange={() => setKeeperId(field.id)}
              className="mt-0.5 h-3.5 w-3.5 accent-crop-500"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink-100">
                {describeField(field)}
              </span>
              <span className="block text-[11px] text-ink-400">
                {workspace.features.filter((f) => f.fieldId === field.id).length} polygon
                {workspace.features.filter((f) => f.fieldId === field.id).length === 1 ? '' : 's'}
                {' · '}
                {field.client || 'no client'}
              </span>
            </span>
          </label>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-ink-400">
        {describeField(loser)} will lose the shared area. Ctrl+Z restores it if the result is
        not what you wanted.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button tone="primary" onClick={() => onResolve(keeperId, loser.id)}>
          Clip the overlap
        </Button>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

export function ExportDialog({
  plan,
  status,
  fileName,
  onFileNameChange,
  onDownload,
  onClose,
}: {
  plan: ExportPlan;
  status: ExportBlockers;
  fileName: string;
  onFileNameChange: (value: string) => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement = !status.blocked && status.warnings.length > 0;

  return (
    <Modal title="Export for CropForce" onClose={onClose}>
      {status.blocked ? (
        <>
          <p className="text-xs leading-relaxed text-red-200">
            The export is blocked until these are resolved. Every one of them would produce a
            boundary file CropForce cannot use as it stands.
          </p>
          <ul className="mt-2 space-y-1 rounded-md border border-red-800/60 bg-red-950/40 p-2.5">
            {status.reasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-[11px] leading-relaxed text-red-100">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                {reason}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 rounded-md border border-ink-700 bg-ink-950/60 p-3">
            <Stat label="Rows" value={String(plan.rows.length)} />
            <Stat
              label="Polygons"
              value={String(plan.rows.reduce((sum, row) => sum + row.geometry.coordinates.length, 0))}
            />
            <Stat label="Projection" value="WGS84" />
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
            One row per field, each field's polygons merged into a single MultiPolygon, with
            Client, Farm and Field written as 30-character text columns. The zip contains
            .shp, .shx, .dbf, .prj and .cpg.
          </p>

          {plan.unassignedCount > 0 && (
            <p className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/30 p-2.5
              text-[11px] leading-relaxed text-amber-200">
              {plan.unassignedCount} polygon{plan.unassignedCount === 1 ? '' : 's'} not assigned
              to a field will not be included.
            </p>
          )}

          {status.warnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-700/50 bg-amber-950/25 p-2.5">
              <h3 className="mb-1.5 text-[11px] font-semibold text-amber-200">
                {status.warnings.length} warning{status.warnings.length === 1 ? '' : 's'} left
                unresolved
              </h3>
              <ul className="space-y-1">
                {status.warnings.slice(0, 6).map((warning) => (
                  <li key={warning} className="text-[11px] leading-relaxed text-amber-200/85">
                    {warning}
                  </li>
                ))}
                {status.warnings.length > 6 && (
                  <li className="text-[11px] text-amber-200/70">
                    and {status.warnings.length - 6} more.
                  </li>
                )}
              </ul>
              <label className="mt-2 flex items-start gap-2 text-[11px] text-amber-100">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-amber-400"
                />
                Download anyway — I have reviewed these warnings.
              </label>
            </div>
          )}

          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-ink-300">File name</span>
            <span className="mt-1 flex items-center gap-1.5">
              <input
                value={fileName}
                onChange={(event) => onFileNameChange(event.target.value)}
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5
                  text-xs text-ink-100 focus:border-crop-500 focus:outline-none"
              />
              <span className="text-xs text-ink-400">.zip</span>
            </span>
          </label>
        </>
      )}

      <div className="mt-4 flex items-center gap-2">
        <span className="text-[10px] text-ink-500">
          Written in your browser. Nothing is uploaded.
        </span>
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button
            tone="primary"
            disabled={status.blocked || (needsAcknowledgement && !acknowledged)}
            onClick={onDownload}
          >
            Download zip
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm tabular-nums text-ink-100">{value}</dd>
    </div>
  );
}
