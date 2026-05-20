import Announcements from "@/components/Announcements";
import { useAuth } from "@/lib/AuthContext";
import BigCalendar from "@/components/BigCalender";
import FormModal from "@/components/FormModal";
import Performance from "@/components/Performance";
import { Link } from "react-router-dom";

const SingleTeacherPage = () => {
  const { role } = useAuth();
  return (
    <div className="flex-1 p-4 flex flex-col gap-4 xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3">
        {/* TOP */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* USER INFO CARD */}
          <div className="bg-lamaSky py-6 px-4 rounded-md flex-1 flex flex-col gap-4 sm:flex-row">
            <div className="shrink-0">
              <img
                src="https://images.pexels.com/photos/2182970/pexels-photo-2182970.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt=""
                width={144}
                height={144}
                className="size-28 rounded-full object-cover sm:size-32 lg:size-36"
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-between gap-4">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-semibold">Leonard Snyder</h1>
                {(role === "institution_admin" || role === "super_admin") && <FormModal
                  table="teacher"
                  type="update"
                  data={{
                    id: 1,
                    username: "deanguerrero",
                    email: "deanguerrero@gmail.com",
                    password: "password",
                    firstName: "Dean",
                    lastName: "Guerrero",
                    phone: "+1 234 567 89",
                    address: "1234 Main St, Anytown, USA",
                    bloodType: "A+",
                    dateOfBirth: "2000-01-01",
                    sex: "male",
                    img: "https://images.pexels.com/photos/2182970/pexels-photo-2182970.jpeg?auto=compress&cs=tinysrgb&w=1200",
                  }}
                />}
              </div>
              <p className="text-sm text-gray-500">
                Lorem ipsum, dolor sit amet consectetur adipisicing elit.
              </p>
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-medium">
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <img src="/blood.png" alt="" width={14} height={14} />
                  <span>A+</span>
                </div>
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <img src="/date.png" alt="" width={14} height={14} />
                  <span>January 2025</span>
                </div>
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <img src="/mail.png" alt="" width={14} height={14} />
                  <span>user@gmail.com</span>
                </div>
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <img src="/phone.png" alt="" width={14} height={14} />
                  <span>+1 234 567</span>
                </div>
              </div>
            </div>
          </div>
          {/* SMALL CARDS */}
          <div className="flex-1 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {/* CARD */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex gap-4">
              <img
                src="/singleAttendance.png"
                alt=""
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <div className="">
                <h1 className="text-xl font-semibold">90%</h1>
                <span className="text-sm text-gray-400 dark:text-gray-300">Attendance</span>
              </div>
            </div>
            {/* CARD */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex gap-4">
              <img
                src="/singleBranch.png"
                alt=""
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <div className="">
                <h1 className="text-xl font-semibold">2</h1>
                <span className="text-sm text-gray-400 dark:text-gray-300">Branches</span>
              </div>
            </div>
            {/* CARD */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex gap-4">
              <img
                src="/singleLesson.png"
                alt=""
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <div className="">
                <h1 className="text-xl font-semibold">6</h1>
                <span className="text-sm text-gray-400 dark:text-gray-300">Lessons</span>
              </div>
            </div>
            {/* CARD */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex gap-4">
              <img
                src="/singleClass.png"
                alt=""
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <div className="">
                <h1 className="text-xl font-semibold">6</h1>
                <span className="text-sm text-gray-400 dark:text-gray-300">Classes</span>
              </div>
            </div>
          </div>
        </div>
        {/* BOTTOM */}
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-md p-4 h-[clamp(36rem,75vh,52rem)] overflow-hidden">
          <h1>Teacher&apos;s Schedule</h1>
          <BigCalendar />
        </div>
      </div>
      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md">
          <h1 className="text-xl font-semibold">Shortcuts</h1>
          <div className="mt-4 flex gap-4 flex-wrap text-xs text-gray-500">
            <Link className="p-3 rounded-md bg-lamaSkyLight" to="/">
              Teacher&apos;s Classes
            </Link>
            <Link className="p-3 rounded-md bg-lamaPurpleLight" to="/">
              Teacher&apos;s Students
            </Link>
            <Link className="p-3 rounded-md bg-lamaYellowLight" to="/">
              Teacher&apos;s Lessons
            </Link>
            <Link className="p-3 rounded-md bg-pink-50" to="/">
              Teacher&apos;s Exams
            </Link>
            <Link className="p-3 rounded-md bg-lamaSkyLight" to="/">
              Teacher&apos;s Assignments
            </Link>
          </div>
        </div>
        <Performance />
        <Announcements />
      </div>
    </div>
  );
};

export default SingleTeacherPage;
