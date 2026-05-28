import { USE_MOCK } from "@/lib/data";

type AlertSeverity = "high" | "medium" | "info";

interface Alert {
  id: number;
  message: string;
  time: string;
  severity: AlertSeverity;
  read: boolean;
}

const alerts: Alert[] = [
  {
    id: 1,
    message: "Login anomaly: geo-jump detected for admin@greenfield.edu",
    time: "2h ago",
    severity: "high",
    read: false,
  },
  {
    id: 2,
    message: "Brute-force attempt blocked — 12 failed logins at Maputo Primary",
    time: "5h ago",
    severity: "high",
    read: false,
  },
  {
    id: 3,
    message: "Bulk export triggered by institution admin at Sunridge International",
    time: "8h ago",
    severity: "medium",
    read: false,
  },
  {
    id: 4,
    message: "New super_admin added: jane.doe@platform.com",
    time: "1d ago",
    severity: "medium",
    read: true,
  },
  {
    id: 5,
    message: "New institution onboarded: Victoria Heights College",
    time: "1d ago",
    severity: "info",
    read: true,
  },
  {
    id: 6,
    message: "Bulk user deactivation (42 accounts) at Harlow Grammar School",
    time: "2d ago",
    severity: "medium",
    read: true,
  },
  {
    id: 7,
    message: "Institution Riverbank Academy suspended by super_admin",
    time: "3d ago",
    severity: "info",
    read: true,
  },
];

const severityConfig: Record<AlertSeverity, { bg: string; text: string }> = {
  high: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
  },
  medium: {
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    text: "text-yellow-700 dark:text-yellow-400",
  },
  info: {
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-700 dark:text-green-400",
  },
};

const AlertsFeed = () => {
  const activeAlerts = USE_MOCK ? alerts : [];
  const unread = activeAlerts.filter((a) => !a.read).length;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Alerts</h2>
        {unread > 0 && (
          <span className="text-xs font-semibold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
            {unread} unread
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {activeAlerts.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            No data — enable Mock Data mode to preview.
          </p>
        )}
        {activeAlerts.map((alert) => {
          const config = severityConfig[alert.severity];
          return (
            <div
              key={alert.id}
              className={`relative flex gap-3 p-3 rounded-lg border-l-4 ${config.bg} ${
                alert.read ? "opacity-60" : ""
              } ${
                alert.severity === "high"
                  ? "border-l-red-500"
                  : alert.severity === "medium"
                  ? "border-l-yellow-400"
                  : "border-l-green-400"
              }`}
            >
              {!alert.read && (
                <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-red-500" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium leading-snug ${config.text}`}>
                  {alert.message}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{alert.time}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-2">
        <button className="w-full text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium text-center">
          View full audit log →
        </button>
      </div>
    </div>
  );
};

export default AlertsFeed;
