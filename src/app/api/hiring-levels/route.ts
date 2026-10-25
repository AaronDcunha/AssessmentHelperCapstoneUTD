import { adminHandler } from "@/server/admin-api";
export const runtime = "nodejs";
export const GET = adminHandler("levels.list");
export const POST = adminHandler("levels.create");
