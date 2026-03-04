import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { UnauthorizedError } from "@/lib/errors/app-error";
import { issueAuthToken } from "@/lib/auth/token";

export interface AuthenticatedAdmin {
  id: number;
  username: string;
  email: string;
  name: string;
}

function mapAdmin(admin: {
  id: number;
  username: string;
  email: string;
  name: string;
}): AuthenticatedAdmin {
  return {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    name: admin.name,
  };
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<{ token: string; user: AuthenticatedAdmin }> {
  const normalizedUsername = username.trim();
  if (!normalizedUsername || !password) {
    throw new UnauthorizedError("Invalid username or password");
  }

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.username, normalizedUsername));

  if (!admin) {
    throw new UnauthorizedError("Invalid username or password");
  }

  const isValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError("Invalid username or password");
  }

  const user = mapAdmin(admin);
  const token = issueAuthToken({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  return { token, user };
}

export async function getAdminById(id: number): Promise<AuthenticatedAdmin | null> {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.id, id));

  if (!admin) {
    return null;
  }

  return mapAdmin(admin);
}
