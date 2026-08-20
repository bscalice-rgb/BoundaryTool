import { useMemo, useState } from 'react';
import type { QAFlag } from '../types';
import { useT } from '../i18n';
import type { StringKey } from '../i18n';
import { canReview, reviewKey } from '../lib/qa';
import { Button, InfoDot, PanelHeader } from './ui';

export interface QAPanelProps {
  flags: QAFlag[];
  /** Review keys the user has waved through; those flags drop out of the working list. */
  reviewed: ReadonlySet<string>;
  onReview: (flag: QAFlag) => void;
  onUnreview: (flag: QAFlag) => void;
  /** Flag the user most recently acted on, highlighted so the list stays legible. */
  activeFlagId: string | null;
  fieldCount: number;
  onAutoFix: (flag: QAFlag) => void;
  onFixManually: (flag: QAFlag) => void;
  /** Selects the polygons behind these flags and frames them on the map. */
  onSelectFlagged: (flags: QAFlag[]) => void;
  onExport: () => void;
}

export default function QAPanel(props: QAPanelProps) {
  const t = useT();
  const [showReviewed, setShowReviewed] = useState(false);

  const { blocking, warnings, reviewed } = useMemo(() => {
    const isReviewed = (flag: QAFlag) => props.reviewed.has(reviewKey(flag));
    return {
      blocking: props.flags.filter((flag) => flag.severity === 'blocking'),
      warnings: props.flags.filter((flag) => flag.severity === 'warning' && !isReviewed(flag)),
      reviewed: props.flags.filter((flag) => flag.severity === 'warning' && isReviewed(flag)),
    };
  }, [props.flags, props.reviewed]);

  const ready = blocking.length === 0 && props.fieldCount > 0;

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-ink-800 bg-ink-900">
      <PanelHeader title={t('qa.title')} count={props.flags.length}>
        <InfoDot label={t('qa.criteriaLabel')} text={t('qa.criteria')} />
      </PanelHeader>

      <div className="shrink-0 border-b border-ink-800 px-3 py-2.5">
        <div className="mb-2 flex items-center gap-3 text-[11px]">
          <SelectableCount
            tone={blocking.length > 0 ? 'red' : 'green'}
            label={t('qa.blockingCount', { count: blocking.length })}
            flags={blocking}
            onSelect={props.onSelectFlagged}
            hint={t('qa.selectHint')}
          />
          <SelectableCount
            tone={warnings.length > 0 ? 'amber' : 'grey'}
            label={t('qa.reviewCount', { count: warnings.length })}
            flags={warnings}
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
        <Button tone="primary" onClick={props.onExport} className="w-full">
          {t('qa.export')}
        </Button>
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
          {props.fieldCount === 0
            ? t('qa.readyNone')
            : ready
              ? t.n('qa.ready', props.fieldCount)
              : t('qa.blocked')}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.flags.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-ink-400">{t('qa.noIssues')}</p>
        )}

        {blocking.length > 0 && <SectionLabel>{t('qa.sectionBlocking')}</SectionLabel>}
        {blocking.map((flag) => (
          <FlagCard key={flag.id} flag={flag} active={props.activeFlagId === flag.id} {...props} />
        ))}

        {warnings.length > 0 && <SectionLabel>{t('qa.sectionWarnings')}</SectionLabel>}
        {warnings.map((flag) => (
          <FlagCard key={flag.id} flag={flag} active={props.activeFlagId === flag.id} {...props} />
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
                  {...props}
                />
              ))}
          </>
        )}
      </div>
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

function FlagCard({
  flag,
  active,
  isReviewed = false,
  onAutoFix,
  onFixManually,
  onSelectFlagged,
  onReview,
  onUnreview,
}: {
  flag: QAFlag;
  active: boolean;
  isReviewed?: boolean;
} & Pick<
  QAPanelProps,
  'onAutoFix' | 'onFixManually' | 'onSelectFlagged' | 'onReview' | 'onUnreview'
>) {
  const t = useT();
  const blocking = flag.severity === 'blocking';
  return (
    <article
      className={`border-b border-ink-850 px-3 py-2.5 ${active ? 'flag-active bg-ink-850' : ''}
        ${isReviewed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
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

      <p className="mt-1 pl-4 text-[11px] leading-relaxed text-ink-400">{flag.detail}</p>

      <div className="mt-2 flex gap-1.5 pl-4">
        {flag.autoFix ? (
          <Button onClick={() => onAutoFix(flag)} title={t('qa.autoFixHint')}>
            {t('qa.autoFix')}
          </Button>
        ) : (
          <span
            className="inline-flex items-center rounded-md border border-dashed border-ink-700
              px-2 py-1.5 text-[11px] text-ink-600"
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
            <Button
              tone="ghost"
              onClick={() => onUnreview(flag)}
              title={t('qa.unreviewHint')}
            >
              {t('qa.unreview')}
            </Button>
          ) : (
            <Button
              tone="ghost"
              onClick={() => onReview(flag)}
              title={t('qa.markReviewedHint')}
            >
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
