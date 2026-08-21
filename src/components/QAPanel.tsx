import { useEffect, useMemo, useState } from 'react';
import type { FieldId, FlagKind, QAFlag } from '../types';
import { useT } from '../i18n';
import type { StringKey } from '../i18n';
import { canReview, reviewKey } from '../lib/qa';
import { PanelToggle } from './SidePanel';
import { Button, InfoDot, PanelHeader } from './ui';

export interface QAPanelProps {
  flags: QAFlag[];
  /** Review keys the user has waved through; those flags drop out of the working list. */
  reviewed: ReadonlySet<string>;
  onReview: (flag: QAFlag) => void;
  onReviewMany: (flags: QAFlag[]) => void;
  onUnreview: (flag: QAFlag) => void;
  /** Flag the user most recently acted on, highlighted so the list stays legible. */
  activeFlagId: string | null;
  fieldCount: number;
  /**
   * Fields the user is working on in the list or on the map. While this is not empty
   * the panel shows only their flags, which is what makes the two panels one workflow
   * rather than two lists that happen to sit side by side.
   */
  scopeFieldIds: ReadonlySet<FieldId>;
  onClearScope: () => void;
  onAutoFix: (flag: QAFlag) => void;
  onAutoFixMany: (flags: QAFlag[]) => void;
  onFixManually: (flag: QAFlag) => void;
  /** Selects the polygons behind these flags and frames them on the map. */
  onSelectFlagged: (flags: QAFlag[]) => void;
  /** Lights the boundary a flag is about, without disturbing the selection. */
  onHoverFlag: (flag: QAFlag | null) => void;
  onToggleCollapsed: () => void;
  onExport: () => void;
}

export default function QAPanel(props: QAPanelProps) {
  const t = useT();
  const [showReviewed, setShowReviewed] = useState(false);
  const [category, setCategory] = useState<FlagKind | 'all'>('all');
  /** Flags ticked for a bulk fix. Held by id, because that is what a flag is known by. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const scoped = useMemo(() => {
    if (props.scopeFieldIds.size === 0) return props.flags;
    return props.flags.filter((flag) => flag.fieldIds.some((id) => props.scopeFieldIds.has(id)));
  }, [props.flags, props.scopeFieldIds]);

  // Categories are counted before the category filter is applied, so the chips keep
  // showing what else is there rather than collapsing to the one that is selected.
  const categories = useMemo(() => {
    const counts = new Map<FlagKind, number>();
    for (const flag of scoped) counts.set(flag.kind, (counts.get(flag.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [scoped]);

  const visible = useMemo(
    () => (category === 'all' ? scoped : scoped.filter((flag) => flag.kind === category)),
    [scoped, category],
  );

  const { blocking, warnings, reviewed } = useMemo(() => {
    const isReviewed = (flag: QAFlag) => props.reviewed.has(reviewKey(flag));
    return {
      blocking: visible.filter((flag) => flag.severity === 'blocking'),
      warnings: visible.filter((flag) => flag.severity === 'warning' && !isReviewed(flag)),
      reviewed: visible.filter((flag) => flag.severity === 'warning' && isReviewed(flag)),
    };
  }, [visible, props.reviewed]);

  // A category that has just been cleared would otherwise leave the panel looking empty.
  useEffect(() => {
    if (category !== 'all' && !props.flags.some((flag) => flag.kind === category)) {
      setCategory('all');
    }
  }, [props.flags, category]);

  /** Working list, in the order it is drawn, so "select all shown" means what it says. */
  const workingList = useMemo(() => [...blocking, ...warnings], [blocking, warnings]);

  // Flags are derived, so a fix can retire the very flag that was ticked.
  const pickedFlags = useMemo(
    () => workingList.filter((flag) => picked.has(flag.id)),
    [workingList, picked],
  );
  const fixable = pickedFlags.filter((flag) => flag.autoFix);
  const reviewable = pickedFlags.filter((flag) => canReview(flag));

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allShownPicked = workingList.length > 0 && pickedFlags.length === workingList.length;

  const ready = props.flags.every((flag) => flag.severity !== 'blocking') && props.fieldCount > 0;
  const allBlocking = props.flags.filter((flag) => flag.severity === 'blocking');
  const allWarnings = props.flags.filter(
    (flag) => flag.severity === 'warning' && !props.reviewed.has(reviewKey(flag)),
  );

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-ink-800 bg-ink-900">
      <PanelHeader title={t('qa.title')} count={props.flags.length}>
        <InfoDot label={t('qa.criteriaLabel')} text={t('qa.criteria')} />
        <PanelToggle
          side="right"
          collapsed={false}
          onToggle={props.onToggleCollapsed}
          hideLabel={t('panel.hideChecks')}
          showLabel={t('panel.showChecks')}
        />
      </PanelHeader>

      <div className="shrink-0 border-b border-ink-800 px-3 py-2.5">
        <div className="mb-2 flex items-center gap-3 text-[11px]">
          <SelectableCount
            tone={allBlocking.length > 0 ? 'red' : 'green'}
            label={t('qa.blockingCount', { count: allBlocking.length })}
            flags={allBlocking}
            onSelect={props.onSelectFlagged}
            hint={t('qa.selectHint')}
          />
          <SelectableCount
            tone={allWarnings.length > 0 ? 'amber' : 'grey'}
            label={t('qa.reviewCount', { count: allWarnings.length })}
            flags={allWarnings}
            onSelect={props.onSelectFlagged}
            hint={t('qa.selectHint')}
          />
          {props.flags.length > 0 && (
            <button
              type="button"
              onClick={() => props.onSelectFlagged(props.flags)}
              title={t('qa.selectAllFlaggedHint')}
              aria-label={t('qa.selectAllFlagged')}
              className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-ink-400
                hover:bg-ink-800 hover:text-crop-300"
            >
              {t('qa.selectAllFlagged')}
            </button>
          )}
        </div>
        {/* The counts and the reason come before the button: an export button shouting
            at the top of a panel that is telling you the export is blocked is the
            loudest thing on screen saying the least useful thing. */}
        <p className="mb-2 text-[11px] leading-relaxed text-ink-400">
          {props.fieldCount === 0
            ? t('qa.readyNone')
            : ready
              ? t.n('qa.ready', props.fieldCount)
              : t('qa.blocked')}
        </p>
        <Button
          tone={ready ? 'primary' : 'default'}
          onClick={props.onExport}
          className="w-full"
        >
          {t('qa.export')}
        </Button>
      </div>

      {props.scopeFieldIds.size > 0 && (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-crop-500/30 bg-crop-500/10
            px-3 py-1.5 text-[11px] text-crop-200"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="currentColor" aria-hidden="true">
            <path d="M2 3h12v2H2zM4 7h8v2H4zM6 11h4v2H6z" />
          </svg>
          <span className="min-w-0 truncate">
            {t.n('qa.scope', props.scopeFieldIds.size)}
          </span>
          <button
            type="button"
            onClick={props.onClearScope}
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] underline
              decoration-dotted underline-offset-2 hover:bg-ink-800"
          >
            {t('qa.scopeClear')}
          </button>
        </div>
      )}

      {categories.length > 1 && (
        <div
          className="flex shrink-0 flex-wrap gap-1 border-b border-ink-800 px-2 py-1.5"
          role="group"
          aria-label={t('qa.categoryLabel')}
        >
          <CategoryChip
            label={t('qa.categoryAll')}
            count={scoped.length}
            active={category === 'all'}
            onClick={() => setCategory('all')}
          />
          {categories.map(([kind, count]) => (
            <CategoryChip
              key={kind}
              label={t(`category.${kind}` as StringKey)}
              count={count}
              active={category === kind}
              onClick={() => setCategory((current) => (current === kind ? 'all' : kind))}
            />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.flags.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-ink-400">{t('qa.noIssues')}</p>
        )}

        {props.flags.length > 0 && visible.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-ink-400">{t('qa.scopeEmpty')}</p>
        )}

        {blocking.length > 0 && (
          <SectionLabel>
            <SectionHeading
              title={t('qa.sectionBlocking')}
              checked={allShownPicked}
              indeterminate={pickedFlags.length > 0 && !allShownPicked}
              label={t('qa.selectAllShown')}
              onToggle={(on) => setPicked(on ? new Set(workingList.map((f) => f.id)) : new Set())}
            />
          </SectionLabel>
        )}
        {blocking.map((flag) => (
          <FlagCard
            key={flag.id}
            flag={flag}
            active={props.activeFlagId === flag.id}
            picked={picked.has(flag.id)}
            onPick={() => toggle(flag.id)}
            {...props}
          />
        ))}

        {warnings.length > 0 && (
          <SectionLabel>
            {blocking.length > 0 ? (
              t('qa.sectionWarnings')
            ) : (
              <SectionHeading
                title={t('qa.sectionWarnings')}
                checked={allShownPicked}
                indeterminate={pickedFlags.length > 0 && !allShownPicked}
                label={t('qa.selectAllShown')}
                onToggle={(on) => setPicked(on ? new Set(workingList.map((f) => f.id)) : new Set())}
              />
            )}
          </SectionLabel>
        )}
        {warnings.map((flag) => (
          <FlagCard
            key={flag.id}
            flag={flag}
            active={props.activeFlagId === flag.id}
            picked={picked.has(flag.id)}
            onPick={() => toggle(flag.id)}
            {...props}
          />
        ))}

        {reviewed.length > 0 && (
          <>
            <SectionLabel>
              <button
                type="button"
                onClick={() => setShowReviewed((value) => !value)}
                className="flex w-full items-center gap-1.5 text-left uppercase tracking-wider
                  text-ink-400 hover:text-ink-100"
              >
                <svg
                  viewBox="0 0 12 12"
                  className={`h-2.5 w-2.5 transition-transform ${showReviewed ? 'rotate-90' : ''}`}
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M4 2l5 4-5 4z" />
                </svg>
                {t('qa.sectionReviewed', { count: reviewed.length })}
              </button>
            </SectionLabel>
            {showReviewed &&
              reviewed.map((flag) => (
                <FlagCard
                  key={flag.id}
                  flag={flag}
                  active={props.activeFlagId === flag.id}
                  isReviewed
                  picked={false}
                  onPick={null}
                  {...props}
                />
              ))}
          </>
        )}
      </div>

      {pickedFlags.length > 0 && (
        <div className="shrink-0 space-y-2 border-t border-ink-700 bg-ink-850 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-ink-100">
              {t.n('qa.bulkSelected', pickedFlags.length)}
            </span>
            <button
              type="button"
              onClick={() => props.onSelectFlagged(pickedFlags)}
              className="ml-auto text-[10px] text-ink-400 underline-offset-2 hover:text-crop-300
                hover:underline"
            >
              {t('selection.zoom')}
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-[10px] text-ink-400 underline-offset-2 hover:text-crop-300
                hover:underline"
            >
              {t('qa.bulkClear')}
            </button>
          </div>
          <div className="flex gap-1.5">
            <Button
              tone="primary"
              className="flex-1"
              disabled={fixable.length === 0}
              title={t('qa.bulkAutoFixHint')}
              onClick={() => {
                props.onAutoFixMany(fixable);
                setPicked(new Set());
              }}
            >
              {t('qa.bulkAutoFix', { count: fixable.length })}
            </Button>
            <Button
              className="flex-1"
              disabled={reviewable.length === 0}
              title={t('qa.bulkReviewHint')}
              onClick={() => {
                props.onReviewMany(reviewable);
                setPicked(new Set());
              }}
            >
              {t('qa.bulkReview', { count: reviewable.length })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** A count that doubles as a way to select everything it counts. */
function SelectableCount({
  tone,
  label,
  flags,
  onSelect,
  hint,
}: {
  tone: 'red' | 'amber' | 'green' | 'grey';
  label: string;
  flags: QAFlag[];
  onSelect: (flags: QAFlag[]) => void;
  hint: string;
}) {
  const selectable = flags.some((flag) => flag.featureIds.length > 0);
  if (!selectable) {
    return (
      <span className="flex items-center gap-1.5">
        <Dot tone={tone} />
        <span className="text-ink-300">{label}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(flags)}
      title={hint}
      className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-ink-800"
    >
      <Dot tone={tone} />
      <span className="text-ink-300 underline decoration-dotted underline-offset-2">{label}</span>
    </button>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors
        ${
          active
            ? 'border-crop-400 bg-crop-500/20 text-crop-200'
            : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100'
        }`}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function SectionHeading({
  title,
  checked,
  indeterminate,
  label,
  onToggle,
}: {
  title: string;
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onToggle: (on: boolean) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="checkbox"
        className="h-3 w-3 accent-crop-500"
        aria-label={label}
        title={label}
        checked={checked}
        ref={(node) => {
          if (node) node.indeterminate = indeterminate;
        }}
        onChange={(event) => onToggle(event.target.checked)}
      />
      {title}
    </span>
  );
}

function FlagCard({
  flag,
  active,
  isReviewed = false,
  picked,
  onPick,
  onAutoFix,
  onFixManually,
  onSelectFlagged,
  onHoverFlag,
  onReview,
  onUnreview,
}: {
  flag: QAFlag;
  active: boolean;
  isReviewed?: boolean;
  picked: boolean;
  onPick: (() => void) | null;
} & Pick<
  QAPanelProps,
  | 'onAutoFix'
  | 'onFixManually'
  | 'onSelectFlagged'
  | 'onHoverFlag'
  | 'onReview'
  | 'onUnreview'
>) {
  const t = useT();
  const blocking = flag.severity === 'blocking';
  return (
    <article
      onMouseEnter={() => onHoverFlag(flag)}
      onMouseLeave={() => onHoverFlag(null)}
      className={`border-b border-ink-850 px-3 py-2.5 ${active ? 'flag-active bg-ink-850' : ''}
        ${picked ? 'bg-ink-850' : ''} ${isReviewed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        {onPick ? (
          <input
            type="checkbox"
            className="mt-0.5 h-3 w-3 shrink-0 accent-crop-500"
            aria-label={t('qa.selectForBulk')}
            checked={picked}
            onChange={onPick}
          />
        ) : (
          <span className="mt-0.5 h-3 w-3 shrink-0" />
        )}
        <Dot tone={blocking ? 'red' : 'amber'} className="mt-1" />
        {flag.featureIds.length > 0 ? (
          <button
            type="button"
            onClick={() => onSelectFlagged([flag])}
            title={t('qa.selectFlagHint')}
            className="min-w-0 flex-1 text-left text-[12px] leading-snug font-medium text-ink-100
              hover:text-crop-300"
          >
            {flag.title}
          </button>
        ) : (
          <h3 className="min-w-0 flex-1 text-[12px] leading-snug font-medium text-ink-100">
            {flag.title}
          </h3>
        )}
        <InfoDot text={flag.guidance} label={t(FLAG_LABELS[flag.kind])} />
      </div>

      <p className="mt-1 pl-9 text-[11px] leading-relaxed text-ink-400">{flag.detail}</p>

      <div className="mt-2 flex gap-1.5 pl-9">
        {flag.autoFix ? (
          <Button onClick={() => onAutoFix(flag)} title={t('qa.autoFixHint')}>
            {t('qa.autoFix')}
          </Button>
        ) : (
          <span
            className="inline-flex items-center rounded-md border border-dashed border-ink-700
              px-2 py-1.5 text-[11px] text-ink-400"
            title={t('qa.noAutoFixHint')}
          >
            {t('qa.noAutoFix')}
          </span>
        )}
        <Button tone="ghost" onClick={() => onFixManually(flag)}>
          {t('qa.fixManually')}
        </Button>
        {canReview(flag) &&
          (isReviewed ? (
            <Button tone="ghost" onClick={() => onUnreview(flag)} title={t('qa.unreviewHint')}>
              {t('qa.unreview')}
            </Button>
          ) : (
            <Button tone="ghost" onClick={() => onReview(flag)} title={t('qa.markReviewedHint')}>
              {t('qa.markReviewed')}
            </Button>
          ))}
      </div>
    </article>
  );
}

const FLAG_LABELS: Record<QAFlag['kind'], StringKey> = {
  'missing-attributes': 'label.consistentNaming',
  'invalid-geometry': 'label.singleZone',
  overlap: 'label.noOverlaps',
  'jagged-edges': 'label.smoothing',
  'non-crop-area': 'label.cropOnly',
  sliver: 'label.cropOnly',
  naming: 'label.consistentNaming',
  unassigned: 'label.multiPolygon',
  'empty-field': 'label.singleZone',
  'duplicate-name': 'label.consistentNaming',
  'name-too-long': 'label.consistentNaming',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="sticky top-0 z-10 bg-ink-850 px-3 py-1 text-[10px] font-semibold
      uppercase tracking-wider text-ink-400">
      {children}
    </h3>
  );
}

function Dot({
  tone,
  className = '',
}: {
  tone: 'red' | 'amber' | 'green' | 'grey';
  className?: string;
}) {
  const tones = {
    red: 'bg-red-400',
    amber: 'bg-amber-400',
    green: 'bg-crop-400',
    grey: 'bg-ink-600',
  };
  return <span className={`h-2 w-2 shrink-0 rounded-full ${tones[tone]} ${className}`} />;
}
