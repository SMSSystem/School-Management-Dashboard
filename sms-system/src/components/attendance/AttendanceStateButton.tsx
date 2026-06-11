type State = 'P' | 'A' | 'L' | 'S' | 'E';

const CYCLE: State[] = ['P', 'A', 'L', 'S', 'E'];

const STATE_CLASS: Record<State, string> = {
  P: 'bg-green-500 text-white',
  A: 'bg-red-500 text-white',
  L: 'bg-orange-400 text-white',
  E: 'bg-blue-500 text-white',
  S: 'bg-purple-500 text-white',
};

const EMPTY_CLASS =
  'bg-gray-100 border-2 border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-600';

interface Props {
  value: State | null;
  onChange: (s: State) => void;
  disabled?: boolean;
  hasSaveError?: boolean;
}

export function AttendanceStateButton({ value, onChange, disabled, hasSaveError }: Props) {
  if (disabled) {
    return <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700" title="Non-school day" />;
  }

  const emptyExtra = hasSaveError ? ' ring-2 ring-red-400' : '';

  if (!value) {
    return (
      <div
        className={`w-8 h-8 rounded cursor-pointer ${EMPTY_CLASS}${emptyExtra}`}
        onClick={() => onChange('P')}
      />
    );
  }

  return (
    <button
      type="button"
      className={`w-8 h-8 rounded text-xs font-bold ${STATE_CLASS[value]}`}
      onClick={() => onChange(CYCLE[(CYCLE.indexOf(value) + 1) % CYCLE.length])}
      title={value}
    >
      {value}
    </button>
  );
}
