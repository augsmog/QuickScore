# Captcha rollback

Disable server enforcement BEFORE rolling back to any build without captcha or
setting the app to off. Otherwise sign-up, anonymous sign-in and password sign-in
will break for that build.

Using an authorized Supabase Management API credential outside the app, send:

```http
PATCH https://api.supabase.com/v1/projects/pltgbizexllikiwryozm/config/auth
Authorization: Bearer <management-api-token>
Content-Type: application/json

{"security_captcha_enabled": false}
```

Confirm server enforcement is disabled, then either set
`EXPO_PUBLIC_CAPTCHA_MODE=off` in the EAS environment and publish a compatible
OTA update/rebuild, or revert the captcha PR and distribute that build. Public
Expo environment variables are baked into the bundle: changing EAS env alone
does not change an installed app. An OTA requires a compatible native runtime
(including react-native-webview); otherwise use a rebuild.

Test email sign-up and password sign-in after rollback. Keep the widget and
public site key available for builds still using optional/required mode.
