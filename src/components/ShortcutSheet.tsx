import { useT } from '../i18n';
import type { StringKey } from '../i18n';
import { TOOLS } from './Toolbar';
import { Modal } from './ui';

const ACTIONS: { keys: string[]; label: StringKey }[] = [
  { keys: ['Del'], label: 'shortcuts.deleteSelection' },
  { keys: ['Esc'], label: 'shortcuts.backToSelect' },
  { keys: ['Ctrl', 'Z'], label: 'history.undo' },
  { keys: ['Ctrl', '⇧', 'Z'], label: 'history.redo' },
  { keys: ['?'], label: 'shortcuts.help' },
];

/**
 * The shortcuts, in the app rather than only in the README. They were discoverable
 * one tooltip at a time; this is the page that shows them all at once.
 */
export default function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t('shortcuts.title')} onClose={onClose} width="max-w-md">
      <div className="grid gap-4 sm:grid-cols-2">
        <Group title={t('shortcuts.tools')}>
          {TOOLS.map((tool) => (
            <Row key={tool.id} keys={[tool.shortcut]} label={t(tool.labelKey)} />
          ))}
        </Group>
        <Group title={t('shortcuts.actions')}>
          {ACTIONS.map((action) => (
            <Row key={action.label} keys={action.keys} label={t(action.label)} />
          ))}
        </Group>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-400">{t('shortcuts.note')}</p>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        {title}
      </h3>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex shrink-0 gap-0.5">
        {keys.map((key) => (
          <kbd
            key={key}
            className="min-w-5 rounded border border-ink-600 bg-ink-950 px-1 py-0.5 text-center
              text-[10px] font-medium text-ink-200"
          >
            {key}
          </kbd>
        ))}
      </dt>
      <dd className="min-w-0 truncate text-[11px] text-ink-300">{label}</dd>
    </div>
  );
}
