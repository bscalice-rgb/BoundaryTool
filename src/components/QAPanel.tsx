import { useMemo } from 'react';
import type { QAFlag } from '../types';
import { Button, InfoDot, PanelHeader } from './ui';

export interface QAPanelProps {
  flags: QAFlag[];
  /** Flag the user most recently acted on, highlighted so the list stays legible. */
  activeFlagId: string | null;
  fieldCount: number;
  onAutoFix: (flag: QAFlag) => void;
  onFixManually: (flag: QAFlag) => void;
  onExport: () => void;
}

export default function QAPanel(props: QAPanelProps) {
  const { blocking, warnings } = useMemo(
    () => ({
      blocking: props.flags.filter((flag) => flag.severity === 'blocking'),
      warnings: props.flags.filter((flag) => flag.severity === 'warning'),
    }),
    [props.flags],
  );

  const ready = blocking.length === 0 && props.fieldCount > 0;

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-ink-800 bg-ink-900">
      <PanelHeader title="Quality checks" count={props.flags.length}>
        <InfoDot
          label="What makes a good field boundary"
          text={
            'A boundary should cover a single continuous management zone, contain crop area ' +
            'only, exclude tracks, watercourses, turbines and tree islands, carry smoothed ' +
            'edges, group multiple blocks farmed as one unit into one field, never overlap a ' +
            'neighbouring field, and use consistent Client / Farm / Field naming.'
          }
        />
      </PanelHeader>

      <div className="shrink-0 border-b border-ink-800 px-3 py-2.5">
        <div className="mb-2 flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <Dot tone={blocking.length > 0 ? 'red' : 'green'} />
            <span className="text-ink-300">
              {blocking.length} blocking
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Dot tone={warnings.length > 0 ? 'amber' : 'grey'} />
            <span className="text-ink-300">{warnings.length} to review</span>
          </span>
        </div>
        <Button tone="primary" onClick={props.onExport} className="w-full">
          Export merged shapefile for CropForce
        </Button>
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
          {props.fieldCount === 0
            ? 'Group some polygons into fields to enable the export.'
            : ready
              ? `${props.fieldCount} field${
                  props.fieldCount === 1 ? '' : 's'
                } ready. Warnings do not block the export.`
              : 'Blocking issues must be resolved before the file can be written.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.flags.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-ink-400">
            No issues found. Checks re-run automatically after every edit.
          </p>
        )}

        {blocking.length > 0 && <SectionLabel>Blocking export</SectionLabel>}
        {blocking.map((flag) => (
          <FlagCard key={flag.id} flag={flag} active={props.activeFlagId === flag.id} {...props} />
        ))}

        {warnings.length > 0 && <SectionLabel>Worth reviewing</SectionLabel>}
        {warnings.map((flag) => (
          <FlagCard key={flag.id} flag={flag} active={props.activeFlagId === flag.id} {...props} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FlagCard({
  flag,
  active,
  onAutoFix,
  onFixManually,
}: {
  flag: QAFlag;
  active: boolean;
} & Pick<QAPanelProps, 'onAutoFix' | 'onFixManually'>) {
  const blocking = flag.severity === 'blocking';
  return (
    <article
      className={`border-b border-ink-850 px-3 py-2.5 ${active ? 'flag-active bg-ink-850' : ''}`}
    >
      <div className="flex items-start gap-2">
        <Dot tone={blocking ? 'red' : 'amber'} className="mt-1" />
        <h3 className="min-w-0 flex-1 text-[12px] leading-snug font-medium text-ink-100">
          {flag.title}
        </h3>
        <InfoDot text={flag.guidance} label={FLAG_LABELS[flag.kind]} />
      </div>

      <p className="mt-1 pl-4 text-[11px] leading-relaxed text-ink-400">{flag.detail}</p>

      <div className="mt-2 flex gap-1.5 pl-4">
        {flag.autoFix ? (
          <Button onClick={() => onAutoFix(flag)} title="Apply the programmatic correction — undo with Ctrl+Z if it is wrong">
            Auto-fix
          </Button>
        ) : (
          <span
            className="inline-flex items-center rounded-md border border-dashed border-ink-700
              px-2 py-1.5 text-[11px] text-ink-600"
            title="This one needs a human eye — there is no correction that is right often enough to apply automatically."
          >
            No auto-fix
          </span>
        )}
        <Button tone="ghost" onClick={() => onFixManually(flag)}>
          Fix manually
        </Button>
      </div>
    </article>
  );
}

const FLAG_LABELS: Record<QAFlag['kind'], string> = {
  'missing-attributes': 'Consistent naming',
  'invalid-geometry': 'Single continuous zone',
  overlap: 'No overlaps',
  'jagged-edges': 'Smoothing',
  'non-crop-area': 'Crop area only',
  sliver: 'Crop area only',
  naming: 'Consistent naming',
  unassigned: 'Multi-polygon fields',
  'empty-field': 'Single continuous zone',
  'duplicate-name': 'Consistent naming',
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
