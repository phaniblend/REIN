import type { UserRole } from "@/lib/roles";

export const TEST_PASSWORD = "RestmanTest1";

export const TEST_LOGINS: {
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  password: string;
}[] = [
  {
    role: "OWNER",
    name: "Test Owner",
    email: "owner@test.restman.live",
    phone: "+15555550101",
    password: TEST_PASSWORD,
  },
  {
    role: "CHEF",
    name: "Test Chef",
    email: "chef@test.restman.live",
    phone: "+15555550102",
    password: TEST_PASSWORD,
  },
  {
    role: "WAITER",
    name: "Test Waiter",
    email: "waiter@test.restman.live",
    phone: "+15555550103",
    password: TEST_PASSWORD,
  },
  {
    role: "STOCK_CLERK",
    name: "Test Stock",
    email: "stock@test.restman.live",
    phone: "+15555550104",
    password: TEST_PASSWORD,
  },
];

export function findTestLogin(email: string) {
  return TEST_LOGINS.find((row) => row.email === email.trim().toLowerCase());
}
