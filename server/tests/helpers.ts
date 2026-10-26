import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();

export const AUTHOR = { email: "priya.sharma@email.com", password: "Author@123" }; // AUTH001: BK001, BK002
export const AUTHOR_IN_PRODUCTION = { email: "kavita.deshmukh@email.com", password: "Author@123" }; // BK015 in typesetting
export const ADMIN = { email: "admin@bookleaf.com", password: "Admin@123" };

export async function tokenFor(creds: { email: string; password: string }): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send(creds);
  if (res.status !== 200) throw new Error(`login failed for ${creds.email}: ${res.status}`);
  return res.body.token as string;
}
