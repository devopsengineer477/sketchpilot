import { useMemo } from 'react';
import { Trash2, Wand2 } from 'lucide-react';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { findBuiltinTemplate } from '../templates/catalog';
import { previewDataUri, templateToPreviewSvg } from '../templates/preview';
import { TEMPLATE_CATEGORY_LABEL, type ResolvedTemplate } from '../templates/types';

export function TemplateCard({
  template,
  onUse,
  onDelete,
  busy,
}: {
  template: ResolvedTemplate;
  onUse: () => void;
  onDelete?: () => void;
  busy?: boolean;
}) {
  // Rendered synchronously from template data: no engine, no async, no drift.
  const preview = useMemo(() => {
    const spec = template.source === 'builtin' ? findBuiltinTemplate(template.id)?.spec : undefined;
    const svg = templateToPreviewSvg(template, spec);
    return svg ? previewDataUri(svg) : null;
  }, [template]);

  return (
    <li className="surface flex flex-col overflow-hidden">
      <div className="relative h-32 w-full border-b border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-950">
        {preview ? (
          <img src={preview} alt={`Preview of ${template.name}`} className="h-full w-full object-contain p-2" draggable={false} />
        ) : (
          <span className="flex h-full items-center justify-center text-[11px] uppercase tracking-wide text-ink-400">
            Preview unavailable
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600 shadow-sm dark:bg-ink-900/90 dark:text-ink-300">
          {template.source === 'user' ? 'Mine' : TEMPLATE_CATEGORY_LABEL[template.category]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-medium leading-tight">{template.name}</h3>
        <p className="line-clamp-2 text-[12px] muted">{template.description || 'No description'}</p>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-ink-100 px-2 py-1.5 dark:border-ink-800">
        {onDelete ? (
          <IconButton label={`Delete template “${template.name}”`} onClick={onDelete}>
            <Trash2 size={15} aria-hidden />
          </IconButton>
        ) : null}
        <Button size="sm" variant="primary" onClick={onUse} disabled={busy}>
          <Wand2 size={14} aria-hidden />
          Use template
        </Button>
      </div>
    </li>
  );
}
