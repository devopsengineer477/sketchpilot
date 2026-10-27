import { useCallback, useEffect, useMemo, useState } from 'react';
import { repository, type SortKey } from '../storage/repository';
import type { DrawingMetadata, TemplateCategory } from '../storage/schemas';
import { listAllTemplates, builtinAsResolved } from '../templates/service';
import type { ResolvedTemplate } from '../templates/types';

export type LibraryTab = 'recent' | 'all' | 'favorites' | 'templates';

export type LibraryState = {
  tab: LibraryTab;
  setTab: (tab: LibraryTab) => void;
  query: string;
  setQuery: (query: string) => void;
  sortBy: SortKey;
  setSortBy: (sort: SortKey) => void;
  category: TemplateCategory | 'all';
  setCategory: (category: TemplateCategory | 'all') => void;
  loading: boolean;
  drawings: DrawingMetadata[];
  thumbnails: Record<string, string>;
  templates: ResolvedTemplate[];
  usage: { usage: number; quota: number } | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const RECENT_LIMIT = 12;

/**
 * All dashboard data access in one place: drawings (through the repository),
 * thumbnails (separate store, loaded in bulk for visible cards) and templates
 * (built-ins from code + the user's own from IndexedDB).
 */
export function useLibrary(): LibraryState {
  const [tab, setTab] = useState<LibraryTab>('recent');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('modified');
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [drawings, setDrawings] = useState<DrawingMetadata[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<ResolvedTemplate[]>(builtinAsResolved());
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const listOptions = {
      sortBy,
      favoritesOnly: tab === 'favorites',
      query: tab === 'templates' ? '' : query,
    };

    const [list, templateList] = await Promise.all([
      repository.list(listOptions),
      listAllTemplates(),
    ]);

    if (list.ok) {
      setDrawings(tab === 'recent' ? list.value.slice(0, RECENT_LIMIT) : list.value);
      setError(null);
    } else {
      setDrawings([]);
      setError(list.error.message);
    }

    setTemplates([...templateList.builtin, ...templateList.user]);
    if (templateList.error) setError(templateList.error);

    // Thumbnails for the cards we are about to render.
    if (list.ok) {
      const entries = await Promise.all(
        list.value.slice(0, RECENT_LIMIT * 4).map(async (item) => {
          const thumbnail = await repository.getThumbnail(item.id);
          return [item.id, thumbnail?.dataUrl] as const;
        }),
      );
      setThumbnails(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))),
      );
    }

    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      setUsage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
    }
    setLoading(false);
  }, [query, sortBy, tab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredTemplates = useMemo(() => {
    if (category === 'all') return templates;
    return templates.filter((template) => template.category === category);
  }, [category, templates]);

  return {
    tab,
    setTab,
    query,
    setQuery,
    sortBy,
    setSortBy,
    category,
    setCategory,
    loading,
    drawings,
    thumbnails,
    templates: filteredTemplates,
    usage,
    error,
    refresh,
  };
}
