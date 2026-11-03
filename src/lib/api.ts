import { NextResponse } from "next/server";

export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiClientError("Request body must be valid JSON", 400);
  }
}
