import { Link } from "react-router-dom";
import { Eye } from "lucide-react";

// The round eye button on a list row that opens the row's detail page. Same look
// as the one on the Students, Teachers and Houses lists.
const ViewDetailsButton = ({ to, name }: { to: string; name: string }) => (
  <Link to={to}>
    <button
      type="button"
      className="w-7 h-7 flex items-center justify-center rounded-full"
      style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
      title={`View ${name}'s details`}
      aria-label={`View ${name}'s details`}
    >
      <Eye className="w-4 h-4 text-white" />
    </button>
  </Link>
);

export default ViewDetailsButton;
