import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { sendPasswordResetEmail, getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { PAGE_SIZE } from "@/lib/utils";
import { RotateCcw } from "lucide-react";

type Admin = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  institutionId: string;
  institutionName: string;
  firstName?: string;
  lastName?: string;
};

const columns = [
  { header: "Info", accessor: "info" },
  { header: "Institution", accessor: "institutionName", className: "hidden md:table-cell" },
  { header: "Phone", accessor: "phone", className: "hidden lg:table-cell" },
  { header: "Address", accessor: "address", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

function ResetCell({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(getAuth(), email);
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return <span className="text-xs text-green-600 dark:text-green-400">Reset sent</span>;
  }

  return (
    <button
      onClick={handleReset}
      disabled={loading}
      title="Send password reset email"
      className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaYellow disabled:opacity-50"
    >
      {loading ? <span className="text-xs font-bold">…</span> : <RotateCcw className="w-3.5 h-3.5" />}
    </button>
  );
}

const ManageAdminsPage = () => {
  const [page, setPage] = useState(1);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [institutionMap, setInstitutionMap] = useState<Record<string, string>>({});

  useEffect(() => {
    getDocs(collection(db, "institutions")).then((snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        map[d.id] = (d.data().name as string) ?? d.id;
      });
      setInstitutionMap(map);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), where("role", "==", "institution_admin")),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: (data.name as string) ?? (`${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "—"),
            email: (data.email as string) ?? "",
            phone: (data.phone as string) ?? "—",
            address: (data.address as string) ?? "—",
            institutionId: (data.institutionId as string) ?? "",
            institutionName: "",
            firstName: data.firstName as string | undefined,
            lastName: data.lastName as string | undefined,
          };
        });
        setAdmins(rows);
      }
    );
    return unsubscribe;
  }, []);

  const adminsWithInstitution = admins.map((a) => ({
    ...a,
    institutionName: institutionMap[a.institutionId] ?? a.institutionId ?? "—",
  }));

  const paginated = adminsWithInstitution.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Admin) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex flex-col gap-0.5 p-4">
        <span className="font-semibold">{item.name}</span>
        <span className="text-xs text-gray-500">{item.email}</span>
      </td>
      <td className="hidden md:table-cell">{item.institutionName}</td>
      <td className="hidden lg:table-cell">{item.phone}</td>
      <td className="hidden lg:table-cell">{item.address}</td>
      <td>
        <div className="flex items-center gap-2">
          <FormModal
            table="institution_admin"
            type="update"
            data={{
              uid: item.id,
              firstName: item.firstName ?? item.name.split(" ")[0] ?? "",
              lastName: item.lastName ?? item.name.split(" ").slice(1).join(" ") ?? "",
              phone: item.phone !== "—" ? item.phone : "",
              address: item.address !== "—" ? item.address : "",
            }}
          />
          <FormModal table="institution_admin" type="delete" id={item.id} />
          <ResetCell email={item.email} />
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Institution Admins</h1>
      </div>
      <Table columns={columns} renderRow={renderRow} data={paginated} />
      <Pagination total={adminsWithInstitution.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default ManageAdminsPage;
