import { randomInt } from "node:crypto";

export const randomPublicId = () => String(randomInt(10000000, 100000000));
const duplicate = (error) =>
  error.code === "ER_DUP_ENTRY" ||
  error.code?.startsWith("ERR_SQLITE_CONSTRAINT") ||
  [1555, 2067].includes(error.errcode);

// Keep internal UUIDs stable: progress, AI ledger and sessions still reference them.
// Existing users get their public ID lazily on authentication or administrative lookup.
export async function ensureProfile(db, user, generateId = randomPublicId) {
  let profile = await db.get(
    "SELECT * FROM auth_profiles WHERE userId=?",
    user.id,
  );
  if (!profile) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const publicId = generateId();
      if (!/^[1-9]\d{7}$/.test(publicId))
        throw Error("Invalid public ID generator");
      try {
        await db.run(
          "INSERT INTO auth_profiles(userId,publicId,displayName,updatedAt) VALUES(?,?,?,?)",
          user.id,
          publicId,
          user.username,
          new Date().toISOString(),
        );
      } catch (error) {
        if (!duplicate(error)) throw error;
        // Concurrent initialization of the same user is safe; UID collisions retry.
        profile = await db.get(
          "SELECT * FROM auth_profiles WHERE userId=?",
          user.id,
        );
        if (profile) break;
        continue;
      }
      profile = await db.get(
        "SELECT * FROM auth_profiles WHERE userId=?",
        user.id,
      );
      break;
    }
  }
  if (!profile) throw Error("暂时无法分配用户 ID，请稍后重试");
  return {
    ...user,
    publicId: profile.publicId,
    displayName: profile.displayName,
  };
}
