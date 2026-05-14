export function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function getOptionalEnv(name: string) {
  return process.env[name] || undefined;
}
