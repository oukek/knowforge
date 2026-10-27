const schedulingKeys = ["maxAttempts", "attemptTimeoutMs", "totalTimeoutMs"];
export function modelOnlyPolicy(policy) {
  const result = { ...policy };
  for (const key of schedulingKeys) delete result[key];
  return result;
}
