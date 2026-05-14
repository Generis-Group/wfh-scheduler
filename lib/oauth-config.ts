export type OAuthProviderConfig = {
  google: boolean;
  atlassian: boolean;
};

function hasProviderConfig(clientIdName: string, clientSecretName: string) {
  return Boolean(process.env[clientIdName]?.trim() && process.env[clientSecretName]?.trim());
}

export function getOAuthProviderConfig(): OAuthProviderConfig {
  return {
    google: hasProviderConfig("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    atlassian: hasProviderConfig("ATLASSIAN_CLIENT_ID", "ATLASSIAN_CLIENT_SECRET")
  };
}
