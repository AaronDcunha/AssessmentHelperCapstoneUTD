import { configurationHandler } from "@/server/configuration-api";

export const GET = configurationHandler("templates.get");
export const PATCH = configurationHandler("templates.update");
