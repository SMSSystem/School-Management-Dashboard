export type InstitutionStatus = "active" | "suspended";

export interface Institution {
  id: number;
  name: string;
  location: string;
  users: number;
  students: number;
  teachers: number;
  lastActivity: string;
  status: InstitutionStatus;
  onboardedDate: string;
}

export const institutions: Institution[] = [
  { id: 1, name: "Greenfield Academy", location: "Lagos, NG", users: 342, students: 210, teachers: 28, lastActivity: "Today", status: "active", onboardedDate: "2026-05-18" },
  { id: 2, name: "Sunridge International", location: "Accra, GH", users: 189, students: 120, teachers: 18, lastActivity: "Yesterday", status: "active", onboardedDate: "2026-05-17" },
  { id: 3, name: "Maputo Primary School", location: "Maputo, MZ", users: 97, students: 65, teachers: 12, lastActivity: "3 days ago", status: "active", onboardedDate: "2026-05-15" },
  { id: 4, name: "Victoria Heights College", location: "Nairobi, KE", users: 421, students: 290, teachers: 35, lastActivity: "Today", status: "active", onboardedDate: "2026-05-14" },
  { id: 5, name: "Riverbank Academy", location: "Kampala, UG", users: 156, students: 98, teachers: 14, lastActivity: "9 days ago", status: "suspended", onboardedDate: "2026-05-12" },
  { id: 6, name: "Harlow Grammar School", location: "Abuja, NG", users: 304, students: 200, teachers: 27, lastActivity: "Today", status: "active", onboardedDate: "2026-05-10" },
  { id: 7, name: "Lakeside Prep", location: "Dar es Salaam, TZ", users: 118, students: 79, teachers: 11, lastActivity: "1 week ago", status: "active", onboardedDate: "2026-05-08" },
  { id: 8, name: "St. Francis College", location: "Kigali, RW", users: 235, students: 155, teachers: 22, lastActivity: "4 days ago", status: "active", onboardedDate: "2026-05-05" },
];
