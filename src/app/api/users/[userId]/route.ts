import { adminHandler } from "@/server/admin-api";
export const runtime = "nodejs";
export const GET = adminHandler("users.get");
export const PATCH = adminHandler("users.update");
