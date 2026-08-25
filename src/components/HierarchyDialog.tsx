import { useMemo, useState } from 'react';
import type { FeatureId, QAFlag, Workspace } from '../types';
import { useT } from '../i18n';
import { formatHa } from '../lib/geo';
import { buildHierarchy, hierarchyToText } from '../lib/hierarchy';
import type { ClientNode, FarmNode, FieldNode } from '../lib/hierarchy';
import { Button, Modal } from './ui';

export interface HierarchyDialogProps {
  workspace: Workspace;
  flags: QAFlag[];
  /** Picking a row hands the field to the rest of the app and closes the dialog. */
  onPickField: (fieldId: string, featureIds: FeatureId[]) => void;
  onCopied: () => void;
  onClose: () => void;
}

/**
 * The session as CropForce will file it.
 *
 * The field table is flat because that is the shape editing wants; this is the same
 * data in the shape the destination uses, which is how someone checks that a client's
 * whole holding arrived and that nothing is sitting under a farm that should not exist.
 */
export default function HierarchyDialog(props: HierarchyDialogProps) {
  const t = useT();
  const tree = useMemo(
    () => buildHierarchy(props.workspace, props.flags),
    [props.workspace, props.flags],
  );

  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const client of tree.clients) {
      keys.add(client.name);
      for (const farm of client.farms) keys.add(`${client.name} ${farm.name}`);
    }
    return keys;
  }, [tree]);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const copy = () => {
    const text = hierarchyToText(tree, {
      client: t('tree.noClient'),
      farm: t('tree.noFarm'),
      field: t('tree.noField'),
    });
    void navigator.clipboard?.writeText(text).then(props.onCopied, () => undefined);
  };

  return (
    <Modal title={t('tree.title')} onClose={props.onClose} width="max-w-2xl">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-300">{t('tree.intro')}</p>
        {tree.clients.length > 0 && (
          <div className="flex shrink-0 gap-1.5">
            <Button
              tone="ghost"
              onClick={() => setCollapsed(collapsed.size === 0 ? allKeys : new Set())}
            >
              {collapsed.size === 0 ? t('tree.collapseAll') : t('tree.expandAll')}
            </Button>
            <Button tone="ghost" onClick={copy}>
              {t('tree.copy')}
            </Button>
          </div>
        )}
      </div>

      {tree.clients.length === 0 ? (
        <p className="mt-4 text-xs text-ink-400">{t('tree.empty')}</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {tree.clients.map((client) => (
            <ClientRow
              key={client.name}
              client={client}
              collapsed={collapsed}
              onToggle={toggle}
              onPickField={props.onPickField}
            />
          ))}
        </ul>
      )}

      {tree.ungrouped > 0 && (
        <p
          className="mt-3 rounded-md border border-amber-700/50 bg-amber-950/25 px-2.5 py-2
            text-[11px] text-amber-200"
        >
          {t.n('tree.ungrouped', tree.ungrouped)}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
        <span className="text-[11px] tabular-nums text-ink-400">
          {t.n('tree.counts', tree.totalFields)} - {formatHa(tree.totalHa)} {t('fields.ha')}
        </span>
        <Button onClick={props.onClose}>{t('export.close')}</Button>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ClientRow({
  client,
  collapsed,
  onToggle,
  onPickField,
}: {
  client: ClientNode;
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onPickField: (fieldId: string, featureIds: FeatureId[]) => void;
}) {
  const t = useT();
  const open = !collapsed.has(client.name);
  return (
    <li>
      <Branch
        label={client.name || t('tree.noClient')}
        muted={client.name === ''}
        open={open}
        onToggle={() => onToggle(client.name)}
        meta={`${t.n('tree.farms', client.farms.length)} / ${t.n('tree.counts', client.fieldCount)}`}
        areaHa={client.areaHa}
        blocking={client.blocking}
        depth={0}
      />
      {open && (
        <ul>
          {client.farms.map((farm) => (
            <FarmRow
              key={farm.name}
              clientName={client.name}
              farm={farm}
              collapsed={collapsed}
              onToggle={onToggle}
              onPickField={onPickField}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FarmRow({
  clientName,
  farm,
  collapsed,
  onToggle,
  onPickField,
}: {
  clientName: string;
  farm: FarmNode;
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onPickField: (fieldId: string, featureIds: FeatureId[]) => void;
}) {
  const t = useT();
  const key = `${clientName} ${farm.name}`;
  const open = !collapsed.has(key);
  return (
    <li>
      <Branch
        label={farm.name || t('tree.noFarm')}
        muted={farm.name === ''}
        open={open}
        onToggle={() => onToggle(key)}
        meta={t.n('tree.counts', farm.fields.length)}
        areaHa={farm.areaHa}
        blocking={farm.blocking}
        depth={1}
      />
      {open && (
        <ul>
          {farm.fields.map((field) => (
            <li key={field.id}>
              <Leaf field={field} onPick={onPickField} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Branch({
  label,
  muted,
  open,
  onToggle,
  meta,
  areaHa,
  blocking,
  depth,
}: {
  label: string;
  muted: boolean;
  open: boolean;
  onToggle: () => void;
  meta: string;
  areaHa: number;
  blocking: number;
  depth: 0 | 1;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{ paddingLeft: 8 + depth * 18 }}
      className={`flex w-full items-center gap-2 rounded py-1 pr-2 text-left hover:bg-ink-850
        ${depth === 0 ? 'text-xs font-semibold text-ink-100' : 'text-[11px] text-ink-200'}`}
    >
      <svg
        viewBox="0 0 12 12"
        className={`h-2.5 w-2.5 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M4 2l5 4-5 4z" />
      </svg>
      <span className={`min-w-0 truncate ${muted ? 'italic text-ink-400' : ''}`}>{label}</span>
      <span className="shrink-0 text-[10px] text-ink-400">{meta}</span>
      {blocking > 0 && (
        <span
          className="shrink-0 rounded-full bg-red-500/20 px-1.5 text-[9px] font-bold text-red-300"
          title={t('tree.blocking', { count: blocking })}
        >
          {blocking}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-400">
        {formatHa(areaHa)}
      </span>
    </button>
  );
}

function Leaf({
  field,
  onPick,
}: {
  field: FieldNode;
  onPick: (fieldId: string, featureIds: FeatureId[]) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onPick(field.id, field.featureIds)}
      style={{ paddingLeft: 8 + 2 * 18 + 14 }}
      className="flex w-full items-center gap-2 rounded py-1 pr-2 text-left text-[11px]
        text-ink-300 hover:bg-ink-850 hover:text-crop-300"
    >
      <span className={`min-w-0 truncate ${field.name === '' ? 'italic text-ink-400' : ''}`}>
        {field.name || t('tree.noField')}
      </span>
      <span className="shrink-0 text-[10px] text-ink-400">
        {t.n('fields.polygonCount', field.polygons)}
      </span>
      {field.blocking > 0 && (
        <span
          className="shrink-0 rounded-full bg-red-500/20 px-1.5 text-[9px] font-bold text-red-300"
          title={t('tree.blocking', { count: field.blocking })}
        >
          {field.blocking}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-400">
        {formatHa(field.areaHa)}
      </span>
    </button>
  );
}
