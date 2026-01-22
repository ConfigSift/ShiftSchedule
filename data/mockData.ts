import type { Employee, Shift, Role } from "@/types";

const makeEmployee = (data: {
  id: string;
  name: string;
  role: Role;
  color: string;
}): Employee => ({
  id: data.id,
  name: data.name,
  email: `${data.id}@example.com`,
  role: data.role,
  color: data.color,
  hireDate: "2024-01-01",
  hourlyRate: 15,
  maxHoursPerWeek: 40,
  isActive: true,
});

export const mockEmployees: Employee[] = [
  // Kitchen
  makeEmployee({ id: "emp-1", name: "John Martinez", role: "kitchen", color: "#f97316" }),
  makeEmployee({ id: "emp-2", name: "Maria Garcia", role: "kitchen", color: "#f97316" }),
  makeEmployee({ id: "emp-3", name: "Carlos Ruiz", role: "kitchen", color: "#f97316" }),

  // Front of House
  makeEmployee({ id: "emp-4", name: "Sarah Chen", role: "front", color: "#3b82f6" }),
  makeEmployee({ id: "emp-5", name: "Mike Johnson", role: "front", color: "#3b82f6" }),
  makeEmployee({ id: "emp-6", name: "Emily Davis", role: "front", color: "#3b82f6" }),
  makeEmployee({ id: "emp-7", name: "Alex Thompson", role: "front", color: "#3b82f6" }),

  // Bar
  makeEmployee({ id: "emp-8", name: "Lisa Park", role: "bar", color: "#a855f7" }),
  makeEmployee({ id: "emp-9", name: "Tom Wilson", role: "bar", color: "#a855f7" }),

  // Management
  makeEmployee({ id: "emp-10", name: "Rachel Green", role: "management", color: "#10b981" }),
  // Kitchen (more)
  makeEmployee({ id: "emp-11", name: "Ana Silva", role: "kitchen", color: "#f97316" }),
  makeEmployee({ id: "emp-12", name: "Marco Rossi", role: "kitchen", color: "#f97316" }),
  makeEmployee({ id: "emp-13", name: "Nina Patel", role: "kitchen", color: "#f97316" }),

  // Front of House (more)
  makeEmployee({ id: "emp-14", name: "Jordan King", role: "front", color: "#3b82f6" }),
  makeEmployee({ id: "emp-15", name: "Priya Nair", role: "front", color: "#3b82f6" }),
  makeEmployee({ id: "emp-16", name: "Ben Carter", role: "front", color: "#3b82f6" }),
  makeEmployee({ id: "emp-17", name: "Sofia Lopez", role: "front", color: "#3b82f6" }),

  // Bar (more)
  makeEmployee({ id: "emp-18", name: "Chris Morgan", role: "bar", color: "#a855f7" }),
  makeEmployee({ id: "emp-19", name: "Jasmine Wong", role: "bar", color: "#a855f7" }),

  // Management (more)
  makeEmployee({ id: "emp-20", name: "David Kim", role: "management", color: "#10b981" }),
];

export const mockShifts: Shift[] = [
  { id: "shift-1", employeeId: "emp-1", date: "2026-01-21", startHour: 9, endHour: 17, status: "scheduled" },
  { id: "shift-2", employeeId: "emp-2", date: "2026-01-21", startHour: 12, endHour: 20, status: "scheduled" },
  { id: "shift-3", employeeId: "emp-3", date: "2026-01-22", startHour: 10, endHour: 18, status: "scheduled" },
];
