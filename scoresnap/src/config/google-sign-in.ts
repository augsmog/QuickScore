// Google sign-in is offered only when this build was given a Google OAuth client id.
// Expo inlines EXPO_PUBLIC_GOOGLE_CLIENT_ID at build time. A build without it used to show
// "Continue with Google" and answer a tap with "Google Sign-In is not yet configured": a sign-in
// button that cannot sign anyone in. Such a build now does not show the button at all.
export const GOOGLE_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
export const GOOGLE_SIGN_IN_AVAILABLE = GOOGLE_CLIENT_ID.length > 0;
