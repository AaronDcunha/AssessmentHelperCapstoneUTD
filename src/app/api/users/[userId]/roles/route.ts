import { adminHandler } from "@/server/admin-api";
export const runtime = "nodejs";
export const PUT = adminHandler("users.roles");
