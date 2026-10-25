import { adminHandler } from "@/server/admin-api";
export const runtime = "nodejs";
export const GET = adminHandler("users.list");
export const POST = adminHandler("users.create");
