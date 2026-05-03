import * as jose from "jose";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const getSecret = () => new TextEncoder().encode(env.JWT_SECRET);

export async function signAccessToken(userId: string): Promise<string> {
  return new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new AppError("Invalid token", 401);
    }
    return { sub: payload.sub };
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }
}
