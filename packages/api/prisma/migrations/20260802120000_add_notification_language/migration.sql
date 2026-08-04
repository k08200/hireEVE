-- Language for notification copy Klorn composes itself (banner titles/bodies).
-- Server-side because a push is built on the server, where there is no browser
-- or Mac locale to read; the clients' language settings only governed their own
-- UI chrome. Defaults to 'en', matching the web's documented "English is the
-- default, Korean is opt-in" policy, so no existing user's notifications change.
ALTER TABLE "AutomationConfig" ADD COLUMN "notificationLanguage" TEXT NOT NULL DEFAULT 'en';
