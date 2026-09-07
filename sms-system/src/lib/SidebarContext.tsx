import { createRequiredContext } from './createRequiredContext';

type SidebarContextValue = {
  collapsed: boolean;
  toggleSidebar: () => void;
  // Collapses the sidebar for the duration of a tour without touching the
  // persisted preference (localStorage). DashboardLayout restores whatever the
  // sidebar's state was beforehand once the tour ends.
  collapseForTour: () => void;
};

export const [SidebarContext, useSidebar] =
  createRequiredContext<SidebarContextValue>('useSidebar', 'DashboardLayout');
