import type { UserRole } from "@/lib/roles";

export const TEST_PASSWORD = "RestmanTest1";

export type TestKitchen = {
  name: string;
  city: string;
  region: string;
  logins: {
    role: UserRole;
    name: string;
    email: string;
    phone: string;
    password: string;
  }[];
};

export const TEST_KITCHENS: TestKitchen[] = [
  {
    name: "Restman Test Kitchen",
    city: "Chicago",
    region: "IL",
    logins: [
      { role: "OWNER", name: "Test Owner", email: "owner@test.restman.live", phone: "+15555550101", password: TEST_PASSWORD },
      { role: "CHEF", name: "Test Chef", email: "chef@test.restman.live", phone: "+15555550102", password: TEST_PASSWORD },
      { role: "WAITER", name: "Test Waiter", email: "waiter@test.restman.live", phone: "+15555550103", password: TEST_PASSWORD },
      { role: "STOCK_CLERK", name: "Test Stock", email: "stock@test.restman.live", phone: "+15555550104", password: TEST_PASSWORD },
    ],
  },
  {
    name: "Restman Isolation Kitchen",
    city: "Austin",
    region: "TX",
    logins: [
      { role: "OWNER", name: "Isolation Owner", email: "owner@isolation.restman.live", phone: "+15555550201", password: TEST_PASSWORD },
      { role: "CHEF", name: "Isolation Chef", email: "chef@isolation.restman.live", phone: "+15555550202", password: TEST_PASSWORD },
      { role: "WAITER", name: "Isolation Waiter", email: "waiter@isolation.restman.live", phone: "+15555550203", password: TEST_PASSWORD },
      { role: "STOCK_CLERK", name: "Isolation Stock", email: "stock@isolation.restman.live", phone: "+15555550204", password: TEST_PASSWORD },
    ],
  },
];

export const TEST_LOGINS = TEST_KITCHENS.flatMap((kitchen) => kitchen.logins);

export function findTestLogin(email: string) {
  return TEST_LOGINS.find((row) => row.email === email.trim().toLowerCase());
}
