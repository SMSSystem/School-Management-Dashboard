import { createContext, useContext } from 'react';

type SidebarContextValue = {
  collapsed: boolean;
  toggleSidebar: () => void;
  // Collapses the sidebar for the duration of a tour without touching the
  // persisted preference (localStorage). DashboardLayout restores whatever the
  // sidebar's state was beforehand once the tour ends.
  collapseForTour: () => void;
};

export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within DashboardLayout');
  return ctx;
}
