import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { rolePermissions } from "../prisma/seed-data.mjs";
import { hashPassword, usernameFromName } from "../src/server/account-auth.ts";
import { getPrisma } from "../src/server/prisma.ts";

class BootstrapError extends Error {}

function validatePassword(password) {
  if (!password.trim() || password.length > 256) throw new BootstrapError("Enter a non-blank password of up to 256 characters.");
}

export async function bootstrapAdmin(prisma, { name, email, password }) {
  const fullName = name.trim();
  const username = usernameFromName(fullName);
  email = email.trim().toLowerCase();
  if (!/[\p{L}\p{N}]/u.test(fullName) || fullName.length > 200) throw new BootstrapError("Enter a name of up to 200 characters containing a letter or number.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BootstrapError("Enter a valid email address.");
  validatePassword(password);
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async db => {
    const activeAdmin = await db.appUser.findFirst({
      where: { isActive: true, userRoles: { some: { role: { roleName: "Admin" } } } },
      select: { userId: true },
    });
    if (activeAdmin) throw new BootstrapError("An active Admin already exists. Use the Admin interface to manage access.");

    const conflict = await db.appUser.findFirst({
      where: { OR: [{ username: { equals: username, mode: "insensitive" } }, { email: { equals: email, mode: "insensitive" } }] },
      select: { userId: true },
    });
    if (conflict) throw new BootstrapError("The username or email already belongs to an account.");

    const permissionNames = [...new Set(Object.values(rolePermissions).flat())];
    await db.permission.createMany({ data: permissionNames.map(permissionName => ({ permissionName })), skipDuplicates: true });
    const permissions = await db.permission.findMany({ where: { permissionName: { in: permissionNames } } });
    const permissionIds = new Map(permissions.map(permission => [permission.permissionName, permission.permissionId]));
    const existingRoles = await db.role.findMany({ where: { roleName: { in: Object.keys(rolePermissions) } } });
    const roles = new Map(existingRoles.map(role => [role.roleName, role]));
    for (const [roleName, grants] of Object.entries(rolePermissions)) {
      if (roles.has(roleName)) continue;
      const role = await db.role.create({ data: {
        roleName,
        rolePermissions: { create: grants.map(permission => ({ permissionId: permissionIds.get(permission) })) },
      } });
      roles.set(roleName, role);
    }

    return db.appUser.create({
      data: {
        fullName, username, email,
        loginCredential: { create: { passwordHash } },
        userRoles: { create: { roleId: roles.get("Admin").roleId } },
      },
      select: { username: true },
    });
  }, { isolationLevel: "Serializable" });
}

async function main() {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY || process.argv.length !== 2) {
    throw new BootstrapError("Run npm run admin:bootstrap in an interactive terminal without arguments.");
  }
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (hidden) callback();
      else stdout.write(chunk, encoding, callback);
    },
  });
  const prompt = createInterface({ input: stdin, output, terminal: true, historySize: 0 });
  const controller = new AbortController();
  prompt.on("SIGINT", () => controller.abort());
  prompt.on("close", () => controller.abort());
  const question = label => prompt.question(label, { signal: controller.signal });
  async function passwordQuestion(label) {
    stdout.write(label);
    hidden = true;
    try { return await question(""); }
    finally { hidden = false; stdout.write("\n"); }
  }

  let prisma;
  try {
    prisma = getPrisma();
    const name = await question("Full name: ");
    console.log(`Username: ${usernameFromName(name)}`);
    const email = await question("Email: ");
    const password = await passwordQuestion("Password: ");
    validatePassword(password);
    if (await passwordQuestion("Confirm password: ") !== password) throw new BootstrapError("The passwords did not match.");
    const account = await bootstrapAdmin(prisma, { name, email, password });
    console.log(`Admin created. Sign in as ${account.username} and open Admin → Users.`);
  } finally {
    prompt.close();
    await prisma?.$disconnect();
  }
}

if (import.meta.main) {
  try { await main(); }
  catch (error) {
    const message = error.name === "AbortError" ? "Bootstrap cancelled."
      : error.code === "P2002" || error.code === "P2034" ? "Another account or bootstrap changed the database. Check whether an Admin exists before retrying."
        : error.code ? "Database operation failed. Check the connection and confirm that migrations have been applied."
          : error instanceof BootstrapError ? error.message : "Bootstrap failed. Verify the deployment database configuration and try again.";
    console.error(message);
    process.exitCode = 1;
  }
}
