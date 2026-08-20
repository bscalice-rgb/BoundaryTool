import { useMemo, useState } from 'react';
import type { Position } from 'geojson';
import type { WField, Workspace } from '../types';
import { useT } from '../i18n';
import { formatLatLon, parseLatLon } from '../lib/coords';
import type {
  AttributeSource,
  AttributeTarget,
  ColumnMapping,
  ImportReport,
  JoinFormat,
} from '../lib/import';
import { JOIN_FORMATS, collectColumns, guessMapping, readSource } from '../lib/import';
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
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const columns = useMemo(
    () => collectColumns(report.features.map((f) => f.sourceProps)),
    [report.features],
  );
  const [mapping, setMapping] = useState<ColumnMapping>(() => guessMapping(columns));

  const sources = [...new Set(report.features.map((f) => f.source))];

  const choose = (target: AttributeTarget, key: string | null) =>
    setMapping((current) => {
      const next = { ...current, [target]: { ...current[target], column: key } };
      // One column cannot fill two attributes, so picking it here releases it there.
      for (const other of ['client', 'farm', 'field'] as AttributeTarget[]) {
        if (other !== target && key !== null && next[other].column === key) {
          next[other] = { ...next[other], column: null };
        }
      }
      return next;
    });

  const setExtra = (target: AttributeTarget, patch: Partial<AttributeSource>) =>
    setMapping((current) => ({ ...current, [target]: { ...current[target], ...patch } }));

  /** What the first feature carrying anything would end up called. */
  const previewOf = (target: AttributeTarget): string => {
    for (const feature of report.features) {
      const value = readSource(feature.sourceProps, mapping[target]);
      if (value !== '') return value;
    }
    return '';
  };

  return (
    <Modal title={t('import.title')} onClose={onCancel}>
      <p className="text-xs leading-relaxed text-ink-300">
        {t.n('import.read', report.features.length, {
          files: t.n('import.files', sources.length),
        })}
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
          <h3 className="mb-1 text-[11px] font-semibold text-ink-300">{t('import.notes')}</h3>
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
          <h3 className="mb-1 text-[11px] font-semibold text-red-200">{t('import.errors')}</h3>
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
            {t('import.mappingTitle')}
          </legend>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
            {t(columns.length === 0 ? 'import.mappingNone' : 'import.mappingHelp')}
          </p>

          {columns.length > 0 && (
            <div className="mt-2.5 space-y-2">
              {(['client', 'farm', 'field'] as AttributeTarget[]).map((target) => {
                const source = mapping[target];
                const preview = previewOf(target);
                const over = preview.length > 30;
                const label = t(`fields.${target}` as const);
                return (
                  <div key={target} className="grid grid-cols-[64px_1fr] items-start gap-2">
                    <span className="pt-1.5 text-xs font-medium text-ink-100">{label}</span>
                    <div>
                      <select
                        value={source.column ?? ''}
                        aria-label={t('import.columnLabel', { target: label })}
                        onChange={(event) => choose(target, event.target.value || null)}
                        className="w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5
                          text-xs text-ink-100 focus:border-crop-500 focus:outline-none"
                      >
                        <option value="">{t('import.leaveBlank')}</option>
                        {columns.map((column) => (
                          <option key={column.key} value={column.key}>
                            {column.key} ({column.filled}/{report.features.length})
                          </option>
                        ))}
                      </select>

                      {source.column !== null && (
                        <div className="mt-1.5 flex gap-1.5">
                          <select
                            value={source.extra ?? ''}
                            aria-label={t('import.secondColumnLabel', { target: label })}
                            onChange={(event) =>
                              setExtra(target, { extra: event.target.value || null })
                            }
                            className="min-w-0 flex-1 rounded-md border border-ink-800 bg-ink-950
                              px-2 py-1 text-[11px] text-ink-300 focus:border-crop-500
                              focus:outline-none"
                          >
                            <option value="">{t('import.noSecond')}</option>
                            {columns
                              .filter((column) => column.key !== source.column)
                              .map((column) => (
                                <option key={column.key} value={column.key}>
                                  + {column.key}
                                </option>
                              ))}
                          </select>
                          {source.extra !== null && (
                            <select
                              value={source.format}
                              aria-label={t('import.joinLabel', { target: label })}
                              onChange={(event) =>
                                setExtra(target, { format: event.target.value as JoinFormat })
                              }
                              className="shrink-0 rounded-md border border-ink-800 bg-ink-950
                                px-2 py-1 text-[11px] text-ink-300 focus:border-crop-500
                                focus:outline-none"
                            >
                              {JOIN_FORMATS.map((format) => (
                                <option key={format.id} value={format.id}>
                                  {format.example} · {t(format.labelKey)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {preview !== '' && (
                        <span className="mt-1 block truncate text-[10px] text-ink-500">
                          {t('import.example', { value: preview })}
                          {over && (
                            <span className="text-amber-400">
                              {t('import.tooLong', { count: preview.length, limit: 30 })}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>{t('import.cancel')}</Button>
        <Button
          tone="primary"
          disabled={report.features.length === 0}
          onClick={() => onConfirm(mapping)}
        >
          {t('import.confirm')}
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
  const t = useT();
  const [keeperId, setKeeperId] = useState(fields[0].id);
  const loser = fields.find((field) => field.id !== keeperId)!;

  return (
    <Modal title={t('overlap.title')} onClose={onCancel} width="max-w-md">
      <p className="text-xs leading-relaxed text-ink-300">{t('overlap.intro')}</p>

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
                {describeField(field, t)}
              </span>
              <span className="block text-[11px] text-ink-400">
                {t.n(
                  'overlap.polygons',
                  workspace.features.filter((f) => f.fieldId === field.id).length,
                )}
                {' · '}
                {field.client || t('overlap.noClient')}
              </span>
            </span>
          </label>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-ink-400">
        {t('overlap.loses', { field: describeField(loser, t) })}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>{t('import.cancel')}</Button>
        <Button tone="primary" onClick={() => onResolve(keeperId, loser.id)}>
          {t('overlap.confirm')}
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
  const t = useT();
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement = !status.blocked && status.warnings.length > 0;

  return (
    <Modal title={t('export.title')} onClose={onClose}>
      {status.blocked ? (
        <>
          <p className="text-xs leading-relaxed text-red-200">{t('export.blockedIntro')}</p>
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
            <Stat label={t('export.rows')} value={String(plan.rows.length)} />
            <Stat
              label={t('export.polygons')}
              value={String(plan.rows.reduce((sum, row) => sum + row.geometry.coordinates.length, 0))}
            />
            <Stat label={t('export.projection')} value="WGS84" />
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-400">{t('export.summary')}</p>

          {plan.unassignedCount > 0 && (
            <p className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/30 p-2.5
              text-[11px] leading-relaxed text-amber-200">
              {t.n('export.unassigned', plan.unassignedCount)}
            </p>
          )}

          {status.warnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-700/50 bg-amber-950/25 p-2.5">
              <h3 className="mb-1.5 text-[11px] font-semibold text-amber-200">
                {t.n('export.warnings', status.warnings.length)}
              </h3>
              <ul className="space-y-1">
                {status.warnings.slice(0, 6).map((warning) => (
                  <li key={warning} className="text-[11px] leading-relaxed text-amber-200/85">
                    {warning}
                  </li>
                ))}
                {status.warnings.length > 6 && (
                  <li className="text-[11px] text-amber-200/70">
                    {t('export.andMore', { count: status.warnings.length - 6 })}
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
                {t('export.acknowledge')}
              </label>
            </div>
          )}

          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-ink-300">{t('export.fileName')}</span>
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
        <span className="text-[10px] text-ink-500">{t('export.localNote')}</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('export.close')}</Button>
          <Button
            tone="primary"
            disabled={status.blocked || (needsAcknowledgement && !acknowledged)}
            onClick={onDownload}
          >
            {t('export.download')}
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

/* -------------------------------------------------------------------------- */
/* Go to coordinates                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The fallback for a browser that cannot say where it is. Everything is parsed locally:
 * a place name would need a geocoding service, and this tool does not call one.
 */
export function CoordinatesDialog({
  onGo,
  onClose,
}: {
  onGo: (position: Position) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const parsed = parseLatLon(text);
  const invalid = text.trim() !== '' && parsed === null;

  return (
    <Modal title={t('coords.title')} onClose={onClose} width="max-w-md">
      <p className="text-xs leading-relaxed text-ink-300">{t('coords.intro')}</p>

      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && parsed) onGo(parsed);
        }}
        placeholder="48.8566, 2.3522"
        spellCheck={false}
        aria-label={t('coords.label')}
        className={`mt-3 w-full rounded-md border bg-ink-950 px-2.5 py-2 text-xs text-ink-100
          placeholder:text-ink-600 focus:outline-none
          ${invalid ? 'border-red-700/70 focus:border-red-500' : 'border-ink-700 focus:border-crop-500'}`}
      />

      <p className="mt-1.5 min-h-4 text-[11px] text-ink-500">
        {parsed ? (
          <span className="text-crop-300">
            {t('coords.readsAs', { value: formatLatLon(parsed) })}
          </span>
        ) : invalid ? (
          <span className="text-red-300">{t('coords.invalid')}</span>
        ) : (
          t('coords.help')
        )}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>{t('import.cancel')}</Button>
        <Button tone="primary" disabled={!parsed} onClick={() => parsed && onGo(parsed)}>
          {t('coords.go')}
        </Button>
      </div>
    </Modal>
  );
}
