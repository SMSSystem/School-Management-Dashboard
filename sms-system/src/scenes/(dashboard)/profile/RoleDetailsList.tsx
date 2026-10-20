// What goes inside the Role-specific Details card: one label and value per row.
const RoleDetailsList = ({ items }: { items: { label: string; value: string }[] }) => (
  <div className="space-y-3">
    {items.map((item) => (
      <div key={item.label} className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {item.label}
        </span>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {item.value}
        </p>
      </div>
    ))}
  </div>
);

export default RoleDetailsList;
