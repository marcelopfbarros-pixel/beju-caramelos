import { useState, useCallback, useEffect } from 'react';

/**
 * Manages collapsible table/card group state, defaulting all groups to retracted (collapsed)
 * whenever grouping is active and resetting when `resetKey` (e.g. `groupBy`) changes.
 */
export function useExpandedGroups(resetKey?: string) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedGroups({});
  }, [resetKey]);

  const isGroupExpanded = useCallback(
    (key: string, isGrouped: boolean) => !isGrouped || Boolean(expandedGroups[key]),
    [expandedGroups]
  );

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return { isGroupExpanded, toggleGroup };
}
