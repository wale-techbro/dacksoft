export function getAuthCallbackUrl(currentOrigin: string) {
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || currentOrigin;
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", "/onboarding");
  return callbackUrl.toString();
}
