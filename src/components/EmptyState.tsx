import { useT } from '../i18n';
import type { StringKey } from '../i18n';
import { Button } from './ui';

const STEPS: { title: StringKey; body: StringKey }[] = [
  { title: 'empty.step1.title', body: 'empty.step1.body' },
  { title: 'empty.step2.title', body: 'empty.step2.body' },
  { title: 'empty.step3.title', body: 'empty.step3.body' },
  { title: 'empty.step4.title', body: 'empty.step4.body' },
];

export default function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  const t = useT();
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-xl font-semibold text-ink-100">{t('empty.heading')}</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{t('empty.intro')}</p>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-ink-800 bg-ink-900 p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-crop-500/15
                  text-[11px] font-semibold text-crop-300">
                  {index + 1}
                </span>
                <h2 className="text-xs font-semibold text-ink-100">{t(step.title)}</h2>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{t(step.body)}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg border border-dashed border-ink-700 bg-ink-900/50 p-6 text-center">
          <p className="text-xs text-ink-300">{t('empty.dropHere')}</p>
          <Button tone="primary" onClick={onBrowse} className="mt-3">
            {t('empty.choose')}
          </Button>
          <p className="mt-3 text-[10px] text-ink-500">{t('empty.formats')}</p>
        </div>
      </div>
    </div>
  );
}
