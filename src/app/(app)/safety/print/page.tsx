import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { foodSafetyLogs, restaurants, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SafetyPrintPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, session.restaurantId))
    .limit(1);
  const logs = await db
    .select({
      kind: foodSafetyLogs.kind,
      reading: foodSafetyLogs.reading,
      note: foodSafetyLogs.note,
      photo: foodSafetyLogs.photo,
      createdAt: foodSafetyLogs.createdAt,
      userName: users.name,
    })
    .from(foodSafetyLogs)
    .innerJoin(users, eq(foodSafetyLogs.userId, users.id))
    .where(
      and(
        eq(foodSafetyLogs.restaurantId, session.restaurantId),
        gte(foodSafetyLogs.createdAt, since),
      ),
    )
    .orderBy(desc(foodSafetyLogs.createdAt));

  return (
    <div className="space-y-4 print:text-black">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{restaurant?.name ?? "Restaurant"}</h1>
          <p className="text-sm">Food-safety log, last 7 days</p>
        </div>
        <p className="text-sm">Use the browser print dialog and choose Save as PDF.</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">When</th>
            <th>Kind</th>
            <th>Reading</th>
            <th>By</th>
            <th>Note</th>
            <th>Photo</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={`${log.createdAt.toISOString()}-${log.reading}`} className="border-b">
              <td className="py-1">{log.createdAt.toLocaleString()}</td>
              <td>{log.kind === "fridge_temp" ? "Fridge" : "Check"}</td>
              <td>{log.reading}</td>
              <td>{log.userName}</td>
              <td>{log.note}</td>
              <td>
                {log.photo ? (
                  <img alt="" className="h-16" src={`data:image/jpeg;base64,${log.photo}`} />
                ) : (
                  ""
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
