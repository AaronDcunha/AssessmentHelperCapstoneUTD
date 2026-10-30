import { createSemester, deleteSemester } from "./services/semesters";
import { getCurrentUser } from "./permissions";
import { getPrisma } from "./prisma";
import type { ConfigurationUser } from "./configuration-validation";
import { getCycle, getCycles, getSemesters,
  getTemplate, getTemplates, getCurrentTemplate } from "./queries/configuration";
import { createCycle, updateCycle, updateSettings, createTemplate, updateTemplate, publishTemplate } from "./services/configuration";

import { configurationHandler as handler, type Operation } from "./configuration-http";

export function configurationHandler(operation:Operation) { return handler(operation,{getUser:getCurrentUser,execute}); }

async function execute(operation:Operation,user:ConfigurationUser,url:URL,params:Record<string,string>,body:unknown) {
  const prisma=getPrisma();
  switch(operation) {
    case "cycles.list": return getCycles(prisma,user,url);
    case "cycles.get": return getCycle(prisma,user,params.cycleId);
    case "cycles.create": return createCycle(prisma,user,body);
    case "cycles.update": return updateCycle(prisma,user,params.cycleId,body);
    case "cycles.settings": return updateSettings(prisma,user,params.cycleId,body);
    case "semesters.create": return createSemester(prisma,user,body);
    case "semesters.delete": return deleteSemester(prisma,user,params.semesterId,body);
    case "semesters.list": return getSemesters(prisma,user,url);
    case "templates.list": return getTemplates(prisma,user,url);
    case "templates.get": return getTemplate(prisma,user,params.templateId);
    case "templates.current": return getCurrentTemplate(prisma,user,url);
    case "templates.create": return createTemplate(prisma,user,body);
    case "templates.update": return updateTemplate(prisma,user,params.templateId,body);
    case "templates.publish": return publishTemplate(prisma,user,params.templateId,body);
  }
}

