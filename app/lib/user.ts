import { getChatGPTUser } from "../chatgpt-auth";

export async function getAppUser() {
  const user = await getChatGPTUser();
  if (user) return user;
  if (process.env.NODE_ENV === "development") {
    return { id: "demo-owner", displayName: "Demo Owner", email: "demo@cashflo.local", fullName: "Demo Owner" };
  }
  return null;
}
