type Named = { id: string; name: string };

// One filter dropdown for records with an id and a name (term, class or subject): a placeholder option, then the choices by name. The Gradebook and
// the Results page each pass their own class string, since one is laid out for a toolbar and the other for a
// phone-first row, and their own onChange (a class change clears the subject, for example).
export default function NamedSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly Named[];
  placeholder: string;
  className: string;
  disabled?: boolean;
}) {
  return (
    <select className={className} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
