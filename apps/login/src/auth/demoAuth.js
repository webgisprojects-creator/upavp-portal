// Temporary client-side sign-in used only while the portal runs in pre-production.
// NOT a security mechanism: anything shipped to the browser can be read by the user.

/** Parse the JSON list injected at build time. Anything malformed yields an empty list (sign-in disabled). */
export function loadDemoUsers(raw = import.meta.env.VITE_DEMO_USERS) {
  try {
    const users = JSON.parse(raw || "[]");
    return Array.isArray(users)
      ? users.filter((u) => u && typeof u.username === "string" && typeof u.password === "string")
      : [];
  } catch {
    return [];
  }
}

/** Return the matching user, or undefined. */
export function checkDemoLogin(users, username, password) {
  return users.find((user) => user.username === username && user.password === password);
}
