import { configurationHandler } from "@/server/configuration-api";

export const GET = configurationHandler("templates.list");
export const POST = configurationHandler("templates.create");
