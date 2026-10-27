import { Star, Trash2 } from 'lucide-react';
import { IconButton } from '../components/IconButton';
import { formatRelative } from '../lib/format';
import type { DrawingMetadata } from '../storage/schemas';

export function DrawingCard({
  item,
  thumbnail,
  onOpen,
  onToggleFavorite,
  onDelete,
}: {
  item: DrawingMetadata;
  thumbnail?: string;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="surface group relative flex flex-col overflow-hidden">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
        <span className="relative block h-32 w-full overflow-hidden border-b border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-950">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              className="h-full w-full object-contain p-2"
              // Thumbnails are local data URIs; never let the browser fetch anything.
              loading="lazy"
              draggable={false}
            />
          ) : (
            <span className="flex h-full items-center justify-center text-[11px] uppercase tracking-wide text-ink-400">
              {item.elementCount === 0 ? 'Blank canvas' : 'Preview pending'}
            </span>
          )}
        </span>
        <span className="flex flex-col gap-0.5 p-3">
          <span className="line-clamp-1 font-medium">{item.title}</span>
          <span className="text-[11px] muted">
            Edited {formatRelative(item.updatedAt)} · {item.elementCount}{' '}
            {item.elementCount === 1 ? 'element' : 'elements'}
          </span>
        </span>
      </button>
      <div className="flex items-center justify-end gap-1 border-t border-ink-100 px-1.5 py-1 dark:border-ink-800">
        <IconButton
          label={item.favorite ? 'Remove from favourites' : 'Add to favourites'}
          active={item.favorite}
          onClick={onToggleFavorite}
        >
          <Star size={15} aria-hidden fill={item.favorite ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton label={`Delete “${item.title}”`} onClick={onDelete}>
          <Trash2 size={15} aria-hidden />
        </IconButton>
      </div>
    </li>
  );
}
