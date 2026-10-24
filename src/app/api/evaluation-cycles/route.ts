import { configurationHandler } from "@/server/configuration-api";

export const GET = configurationHandler("cycles.list");
export const POST = configurationHandler("cycles.create");
