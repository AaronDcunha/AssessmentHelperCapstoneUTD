import { configurationHandler } from "@/server/configuration-api";

export const GET = configurationHandler("semesters.list");

export const POST = configurationHandler("semesters.create");
