import { useState, useCallback, useEffect } from 'react';

/**
 * Manages collapsible table/card group state, defaulting all groups to retracted (collapsed)
 * whenever grouping is active and resetting when `resetKey` (e.g. `groupBy`) changes.
 */
export function useExpandedGroups(resetKey?: string) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isDefaultExpanded, setIsDefaultExpanded] = useState<boolean>(false);

  useEffect(() => {
    setExpandedGroups({});
    setIsDefaultExpanded(false);
  }, [resetKey]);

  const isGroupExpanded = useCallback(
    (key: string, isGrouped: boolean) =>
      !isGrouped || (expandedGroups[key] ?? isDefaultExpanded),
    [expandedGroups, isDefaultExpanded]
  );

  const toggleGroup = useCallback(
    (key: string) => {
      setExpandedGroups(prev => ({
        ...prev,
        [key]: !(prev[key] ?? isDefaultExpanded)
      }));
    },
    [isDefaultExpanded]
  );

  const expandAll = useCallback(() => {
    setExpandedGroups({});
    setIsDefaultExpanded(true);
  }, []);

  return { isGroupExpanded, toggleGroup, expandAll };
}
