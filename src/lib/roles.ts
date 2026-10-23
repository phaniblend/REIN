export type UserRole = "OWNER" | "CHEF" | "WAITER" | "STOCK_CLERK";

/** Client-safe. Do not import this from a module that pulls in the database. */
export function homePathForRole(role: string) {
  if (role === "CHEF") return "/recipes";
  if (role === "WAITER") return "/orders";
  if (role === "STOCK_CLERK") return "/inventory";
  return "/dashboard";
}
