import { adminHandler } from "@/server/admin-api";
export const runtime = "nodejs";
export const GET = adminHandler("departments.list");
