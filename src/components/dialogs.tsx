import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import {
  JOIN_FORMATS,
  collectColumns,
  guessMapping,
  joinSample,
  joinValues,
  readSource,
} from '../lib/import';
import type { ExportBlockers, ExportPlan } from '../lib/export';
import type { OverlapStrategy, ShrinkPreview } from '../lib/qa';
import { MAX_INSET_M, describeField, fieldAreaM2, largerOf, previewShrinkApart } from '../lib/qa';
import { formatHa, formatNum } from '../lib/geo';
import { Button, Modal } from './ui';

/* -------------------------------------------------------------------------- */
/* Import: attribute mapping                                                   */
/* -------------------------------------------------------------------------- */

export function ImportDialog({
  report,
  loadedSources,
  onConfirm,
  onCancel,
}: {
  report: ImportReport;
  /** Files already in the workspace, so a second load can be spotted before it happens. */
  loadedSources: ReadonlySet<string>;
  onConfirm: (mapping: ColumnMapping, sources: ReadonlySet<string>) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const sources = useMemo(
    () => [...new Set(report.features.map((f) => f.source))],
    [report.features],
  );

  // A file whose name is already in the workspace starts unticked: loading the same one
  // twice is the usual way a boundary ends up in the export in duplicate.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(sources.filter((source) => !loadedSources.has(source))),
  );

  const features = useMemo(
    () => report.features.filter((feature) => chosen.has(feature.source)),
    [report.features, chosen],
  );

  const columns = useMemo(
    () => collectColumns(features.map((f) => f.sourceProps)),
    [features],
  );
  const [mapping, setMapping] = useState<ColumnMapping>(() =>
    guessMapping(collectColumns(report.features.map((f) => f.sourceProps))),
  );

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
    for (const feature of features) {
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

      <fieldset className="mt-3">
        <legend className="text-[11px] font-semibold text-ink-100">
          {t('import.chooseFiles')}
        </legend>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{t('import.chooseHelp')}</p>
        <ul className="mt-2 space-y-0.5">
          {sources.map((source) => {
            const already = loadedSources.has(source);
            return (
              <li key={source}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5
                  text-[11px] text-ink-300 hover:bg-ink-850">
                  <input
                    type="checkbox"
                    className="h-3 w-3 shrink-0 accent-crop-500"
                    aria-label={t('import.selectFile', { file: source })}
                    checked={chosen.has(source)}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(source);
                        else next.delete(source);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 truncate">{source}</span>
                  {already && (
                    <span className="shrink-0 rounded bg-amber-500/20 px-1.5 text-[10px]
                      text-amber-200">
                      {t('import.alreadyLoaded')}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 tabular-nums text-ink-400">
                    {report.features.filter((f) => f.source === source).length}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

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

      {features.length > 0 && columns.length > 0 && (
        <AttributePreview features={features} mapping={mapping} />
      )}

      {features.length > 0 && (
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
                // Each option shows what it would do to this file's own values; an
                // invented pair of names teaches nothing about the data in hand.
                const sample = joinSample(
                  features.map((feature) => feature.sourceProps),
                  source,
                );
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
                            {column.key} ({column.filled}/{features.length})
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
                                  {sample
                                    ? joinValues(sample.main, sample.extra, format.id)
                                    : t(format.labelKey)}
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
        {chosen.size === 0 && report.features.length > 0 && (
          <span className="mr-auto self-center text-[11px] text-amber-300">
            {t('import.noneChosen')}
          </span>
        )}
        <Button onClick={onCancel}>{t('import.cancel')}</Button>
        <Button tone="primary" disabled={features.length === 0} onClick={() => onConfirm(mapping, chosen)}>
          {t('import.confirm')}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * The first few rows of the source table, as they were read.
 *
 * Choosing which column is the Farm from a name and a fill count is guesswork when the
 * names are unhelpful — `f_2`, `NOME`, `cod`. Seeing the values settles it in a glance,
 * and the columns already mapped are marked so the effect of a choice is visible while
 * it is being made.
 */
function AttributePreview({
  features,
  mapping,
}: {
  features: ImportReport['features'];
  mapping: ColumnMapping;
}) {
  const t = useT();
  const ROWS = 5;

  const columns = useMemo(() => {
    const keys: string[] = [];
    for (const feature of features) {
      for (const key of Object.keys(feature.sourceProps)) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
    return keys;
  }, [features]);

  const mapped = useMemo(() => {
    const byColumn = new Map<string, string>();
    for (const target of ['client', 'farm', 'field'] as AttributeTarget[]) {
      const source = mapping[target];
      if (source.column) byColumn.set(source.column, target);
      if (source.extra) byColumn.set(source.extra, target);
    }
    return byColumn;
  }, [mapping]);

  if (columns.length === 0) return null;

  return (
    <section className="mt-4">
      <h3 className="text-[11px] font-semibold text-ink-100">{t('import.preview')}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{t('import.previewHelp')}</p>
      <div className="mt-2 max-h-44 overflow-auto rounded-md border border-ink-700">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-ink-850">
            <tr>
              {columns.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className={`whitespace-nowrap border-b border-ink-700 px-2 py-1 text-left
                    font-semibold ${
                      mapped.has(key) ? 'text-crop-300' : 'text-ink-300'
                    }`}
                >
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.slice(0, ROWS).map((feature, index) => (
              <tr key={index} className="border-b border-ink-850 last:border-0">
                {columns.map((key) => (
                  <td
                    key={key}
                    className={`max-w-40 truncate px-2 py-1 ${
                      mapped.has(key) ? 'bg-crop-500/10 text-ink-100' : 'text-ink-400'
                    }`}
                    title={stringifyCell(feature.sourceProps[key])}
                  >
                    {stringifyCell(feature.sourceProps[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {features.length > ROWS && (
        <p className="mt-1 text-[10px] text-ink-400">
          {t('import.previewMore', { count: features.length - ROWS })}
        </p>
      )}
    </section>
  );
}

const stringifyCell = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

/* -------------------------------------------------------------------------- */
/* Overlap resolution                                                          */
/* -------------------------------------------------------------------------- */

export function OverlapDialog({
  fields,
  duplicate,
  workspace,
  onResolve,
  onCancel,
}: {
  fields: [WField, WField];
  /** True when the two are the same boundary twice, so one of them simply goes. */
  duplicate: boolean;
  workspace: Workspace;
  onResolve: (strategy: OverlapStrategy, keeperId: string, loserId: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [keeperId, setKeeperId] = useState(fields[0].id);
  const [strategy, setStrategy] = useState<OverlapStrategy>('trim-larger');
  const loser = fields.find((field) => field.id !== keeperId)!;

  const largerId = useMemo(
    () => largerOf(workspace, fields[0].id, fields[1].id),
    [workspace, fields],
  );
  const larger = fields.find((field) => field.id === largerId)!;
  const smaller = fields.find((field) => field.id !== largerId)!;

  // Working out the inset means buffering both boundaries half a dozen times, which on a
  // heavily digitised field is a visible pause. It runs after the dialog has painted so
  // the other two routes are usable while it settles.
  const [preview, setPreview] = useState<ShrinkPreview | null | 'pending'>('pending');
  useEffect(() => {
    setPreview('pending');
    const frame = requestAnimationFrame(() =>
      setPreview(previewShrinkApart(workspace, fields[0].id, fields[1].id)),
    );
    return () => cancelAnimationFrame(frame);
  }, [workspace, fields]);

  const fieldRow = (field: WField) => (
    <span className="min-w-0">
      <span className="block text-xs font-medium text-ink-100">{describeField(field, t)}</span>
      <span className="block text-[11px] text-ink-400">
        {t.n('overlap.polygons', workspace.features.filter((f) => f.fieldId === field.id).length)}
        {' · '}
        {field.client || t('overlap.noClient')}
      </span>
    </span>
  );

  /* The same boundary twice is not a disagreement to settle; one copy simply goes. */
  if (duplicate) {
    return (
      <Modal title={t('overlap.duplicateTitle')} onClose={onCancel} width="max-w-md">
        <p className="text-xs leading-relaxed text-ink-300">{t('overlap.duplicateIntro')}</p>

        <div className="mt-3 space-y-1.5">
          {fields.map((field) => (
            <Choice
              key={field.id}
              name="keeper"
              checked={keeperId === field.id}
              onSelect={() => setKeeperId(field.id)}
            >
              {fieldRow(field)}
            </Choice>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-red-300">
          {t('overlap.duplicateLoses', { field: describeField(loser, t) })}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel}>{t('import.cancel')}</Button>
          <Button tone="danger" onClick={() => onResolve('trim-chosen', keeperId, loser.id)}>
            {t('overlap.duplicateConfirm')}
          </Button>
        </div>
      </Modal>
    );
  }

  const shrinkable = preview !== null && preview !== 'pending';
  const resolve = () => {
    if (strategy === 'trim-larger') onResolve(strategy, smaller.id, larger.id);
    else if (strategy === 'shrink-both') onResolve(strategy, fields[0].id, fields[1].id);
    else onResolve(strategy, keeperId, loser.id);
  };

  return (
    <Modal title={t('overlap.title')} onClose={onCancel} width="max-w-md">
      <p className="text-xs leading-relaxed text-ink-300">{t('overlap.intro')}</p>

      <fieldset className="mt-3">
        <legend className="text-[11px] font-semibold text-ink-100">
          {t('overlap.strategy')}
        </legend>

        <div className="mt-2 space-y-1.5">
          <Choice
            name="strategy"
            checked={strategy === 'trim-larger'}
            onSelect={() => setStrategy('trim-larger')}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink-100">
                  {t('overlap.trimLarger')}
                </span>
                <span className="shrink-0 rounded-full bg-crop-500/20 px-1.5 text-[9px]
                  font-semibold uppercase tracking-wide text-crop-200">
                  {t('overlap.noDecision')}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">
                {t('overlap.trimLarger.detail', {
                  field: describeField(larger, t),
                  area: formatHa(fieldAreaM2(workspace, larger.id) / 10_000),
                })}
              </span>
            </span>
          </Choice>

          <Choice
            name="strategy"
            checked={strategy === 'trim-chosen'}
            onSelect={() => setStrategy('trim-chosen')}
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink-100">
                {t('overlap.trimChosen')}
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">
                {t('overlap.trimChosen.detail')}
              </span>
            </span>
          </Choice>

          {strategy === 'trim-chosen' && (
            <div className="ml-6 space-y-1.5">
              {fields.map((field) => (
                <Choice
                  key={field.id}
                  name="keeper"
                  checked={keeperId === field.id}
                  onSelect={() => setKeeperId(field.id)}
                >
                  {fieldRow(field)}
                </Choice>
              ))}
              <p className="text-[11px] text-ink-400">
                {t('overlap.loses', { field: describeField(loser, t) })}
              </p>
            </div>
          )}

          <Choice
            name="strategy"
            checked={strategy === 'shrink-both'}
            disabled={!shrinkable}
            onSelect={() => setStrategy('shrink-both')}
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink-100">
                {t('overlap.shrinkBoth')}
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">
                {preview === 'pending'
                  ? t('overlap.shrinkBoth.measuring')
                  : preview === null
                    ? t('overlap.shrinkBoth.tooDeep', { max: MAX_INSET_M })
                    : t('overlap.shrinkBoth.detail', {
                        inset: formatNum(preview.inset, 1),
                        gap: formatNum(preview.gap, 1),
                        area: formatHa(preview.lostHa),
                      })}
              </span>
            </span>
          </Choice>
        </div>
      </fieldset>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>{t('import.cancel')}</Button>
        <Button
          tone="primary"
          disabled={strategy === 'shrink-both' && !shrinkable}
          onClick={resolve}
        >
          {t(strategy === 'shrink-both' ? 'overlap.confirmShrink' : 'overlap.confirm')}
        </Button>
      </div>
    </Modal>
  );
}

/** A radio dressed as a card, which is how every choice in this dialog is presented. */
function Choice({
  name,
  checked,
  disabled,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-md border p-2.5
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${
          checked
            ? 'border-crop-400 bg-crop-500/10'
            : 'border-ink-700 hover:border-ink-600'
        }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 h-3.5 w-3.5 accent-crop-500"
      />
      {children}
    </label>
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
