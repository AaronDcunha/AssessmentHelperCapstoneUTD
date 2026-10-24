import { configurationHandler } from "@/server/configuration-api";

export const GET = configurationHandler("cycles.get");
export const PATCH = configurationHandler("cycles.update");
