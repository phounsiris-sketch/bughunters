# iOS header hidden under the clock (v83 hotfix)

Cause: v63 changed the viewport meta to `viewport-fit=cover` (a UX-QA suggestion). With `apple-mobile-web-app-status-bar-style: black-translucent` the page then draws under the iOS status bar and the header (bell, profile) sits under the clock, so it can not be tapped. Fix: viewport back to `width=device-width, initial-scale=1` (pinch-zoom stays allowed). A later attempt at safe areas must pad the header, toast, notification panel and full-screen layers with `env(safe-area-inset-top)` first.
