import { adminHandler } from "@/server/admin-api";
export const runtime = "nodejs";
export const PATCH = adminHandler("levels.update");
export const DELETE = adminHandler("levels.delete");
