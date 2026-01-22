import type { Employee, Restaurant, Section, Shift } from "@/types";

const demoRestaurantId = "11111111-1111-1111-1111-111111111111";
const demoRestaurantCode = "SKYBIRD";

const makeEmployee = (data: {
  id: string;
  name: string;
  section: Section;
  restaurantId?: string;
  userRestaurantIds?: string[];
}): Employee => ({
  id: data.id,
  name: data.name,
  section: data.section,
  userRole: data.section === "management" ? "MANAGER" : "EMPLOYEE",
  restaurantId: data.restaurantId,
  profile: {},
  isActive: true,
});

export const mockRestaurants: Restaurant[] = [
  {
    id: demoRestaurantId,
    name: "Skybird Bistro",
    restaurantCode: demoRestaurantCode,
    createdAt: new Date().toISOString(),
    createdByUserId: "emp-10",
  },
];

export const mockEmployees: Employee[] = [
  makeEmployee({ id: "emp-1", name: "John Martinez", section: "kitchen", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-2", name: "Maria Garcia", section: "kitchen", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-3", name: "Carlos Ruiz", section: "kitchen", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-4", name: "Sarah Chen", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-5", name: "Mike Johnson", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-6", name: "Emily Davis", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-7", name: "Alex Thompson", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-8", name: "Lisa Park", section: "bar", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-9", name: "Tom Wilson", section: "bar", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-10", name: "Rachel Green", section: "management", userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-11", name: "Ana Silva", section: "kitchen", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-12", name: "Marco Rossi", section: "kitchen", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-13", name: "Nina Patel", section: "kitchen", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-14", name: "Jordan King", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-15", name: "Priya Nair", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-16", name: "Ben Carter", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-17", name: "Sofia Lopez", section: "front", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-18", name: "Chris Morgan", section: "bar", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-19", name: "Jasmine Wong", section: "bar", restaurantId: demoRestaurantId, userRestaurantIds: [demoRestaurantId] }),
  makeEmployee({ id: "emp-20", name: "David Kim", section: "management", userRestaurantIds: [demoRestaurantId] }),
];

export const mockShifts: Shift[] = [
  { id: "shift-1", employeeId: "emp-1", restaurantId: demoRestaurantId, date: "2026-01-21", startHour: 9, endHour: 17 },
  { id: "shift-2", employeeId: "emp-2", restaurantId: demoRestaurantId, date: "2026-01-21", startHour: 12, endHour: 20 },
  { id: "shift-3", employeeId: "emp-3", restaurantId: demoRestaurantId, date: "2026-01-22", startHour: 10, endHour: 18 },
];
