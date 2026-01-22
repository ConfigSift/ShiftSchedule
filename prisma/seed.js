const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

function dateFromOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function main() {
  const managerPinHash = await bcrypt.hash("1234", 10);
  const staffPinHash = await bcrypt.hash("5678", 10);

  const manager = await prisma.user.upsert({
    where: { email: "manager@shiftflow.local" },
    update: {},
    create: {
      name: "Manager",
      email: "manager@shiftflow.local",
      role: "MANAGER",
      department: "MANAGEMENT",
      pinHash: managerPinHash,
      phone: "555-0000",
      hireDate: new Date("2022-01-15T00:00:00Z"),
      hourlyRate: 30,
      maxHoursPerWeek: 45,
      notes: "Default manager account",
    },
  });

  const sarah = await prisma.user.upsert({
    where: { email: "sarah@shiftflow.local" },
    update: {},
    create: {
      name: "Sarah Chen",
      email: "sarah@shiftflow.local",
      role: "STAFF",
      department: "FRONT",
      pinHash: staffPinHash,
      phone: "555-0104",
      hireDate: new Date("2023-06-20T00:00:00Z"),
      hourlyRate: 16,
      maxHoursPerWeek: 40,
    },
  });

  const carlos = await prisma.user.upsert({
    where: { email: "carlos@shiftflow.local" },
    update: {},
    create: {
      name: "Carlos Ruiz",
      email: "carlos@shiftflow.local",
      role: "STAFF",
      department: "KITCHEN",
      pinHash: null,
      phone: "555-0103",
      hireDate: new Date("2024-01-10T00:00:00Z"),
      hourlyRate: 18,
      maxHoursPerWeek: 32,
    },
  });

  const lisa = await prisma.user.upsert({
    where: { email: "lisa@shiftflow.local" },
    update: {},
    create: {
      name: "Lisa Park",
      email: "lisa@shiftflow.local",
      role: "STAFF",
      department: "BAR",
      pinHash: null,
      phone: "555-0108",
      hireDate: new Date("2022-05-10T00:00:00Z"),
      hourlyRate: 17,
      maxHoursPerWeek: 40,
    },
  });

  const shifts = [
    {
      userId: carlos.id,
      date: dateFromOffset(0),
      startHour: 6,
      endHour: 14,
      status: "scheduled",
    },
    {
      userId: sarah.id,
      date: dateFromOffset(0),
      startHour: 10,
      endHour: 18,
      status: "scheduled",
    },
    {
      userId: lisa.id,
      date: dateFromOffset(0),
      startHour: 16,
      endHour: 24,
      status: "scheduled",
    },
    {
      userId: manager.id,
      date: dateFromOffset(1),
      startHour: 9,
      endHour: 17,
      status: "scheduled",
    },
  ];

  for (const shift of shifts) {
    await prisma.shift.upsert({
      where: {
        userId_date_startHour_endHour: {
          userId: shift.userId,
          date: shift.date,
          startHour: shift.startHour,
          endHour: shift.endHour,
        },
      },
      update: {
        status: shift.status,
        notes: shift.notes ?? null,
      },
      create: shift,
    });
  }

  await prisma.timeOffRequest.upsert({
    where: {
      userId_startDate_endDate: {
        userId: manager.id,
        startDate: dateFromOffset(7),
        endDate: dateFromOffset(8),
      },
    },
    update: {
      note: "Sample request",
      status: "PENDING",
    },
    create: {
      userId: manager.id,
      startDate: dateFromOffset(7),
      endDate: dateFromOffset(8),
      note: "Sample request",
      status: "PENDING",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
