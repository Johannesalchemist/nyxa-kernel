# Evidenz WP-SOPHIA-LIVE-STUDIO — 2026-11-26 (Europe/Berlin)

Quellenstatus: `SOURCE-VERIFIED` · Reviewstatus: ausstehend · Erzeugt: Claude Code (Cloud-Session)

## Promotion (Server A, `deploy`, 18:1x CET)

```
server.mjs: OK            # Drift-Check gegen 6b22046d… (vor Promotion)
public/index.html: OK     # Drift-Check gegen 43e3a490…
# pass 11
# fail 0
bacedc5231c0bdd2d70b317896f40160afe0d69ef130a876bb4f23b7daf3b5f9  server.mjs
3cbfe3a6fbb87d8d260dc9e40ec5b2a1e332621b1c3761d9156ffc76e6f19d96  public/index.html
33b161d73b6a736aef2bc181f881f98001347e61e1873cf6f0949cd63742c9c3  public/sophia-live.html
64375180886c43d86a2a5d2d60fe8c7a770edbe1495fb655a199278435f5e1c4  public/sophia-live.css
601c847612e21de0a658eb307d30869490c38086b2881e520872158b9aed10d7  public/sophia-live.mjs
34d9feabd6a60da83d231741466b83d848eb3e87cf56801f92bb8c383815597a  tests/sophia-live.test.mjs
PROMOTE=OK
```

## Öffentliche Header (aus unabhängigem Netz)

```
/sophia-live.html  content-security-policy: default-src 'self'; frame-src https://thechat.future24.eu; script-src 'self'; … frame-ancestors 'none'; …
                   permissions-policy: camera=(), microphone=(self "https://thechat.future24.eu"), autoplay=(self "https://thechat.future24.eu"), geolocation=()
/                  permissions-policy: camera=(), microphone=(), geolocation=()   (kein frame-src)
/health            permissions-policy: camera=(), microphone=(), geolocation=()   (kein frame-src)
```

## Mobile-Browser-E2E (Playwright/Chromium, Pixel 7, Fake-Mikrofon, gegen Produktion)

```json
{"studio_link":1,"state":"The Room verbunden · Mikrofon im Fenster aktivieren",
 "frame_url":"https://thechat.future24.eu/login","frame_title":"Nyxa — Enter",
 "top_mic_policy":true,"frame_mic_policy":true,"frame_getUserMedia":"ok:1 audio track",
 "frame_rtc":"function","broker_unauth":401,
 "broker_caps":{"ok":true,"live":true,"live_model":"gpt-realtime"},
 "studio_root_mic_policy":false}
```

Screenshot: `WP-SOPHIA-LIVE-STUDIO_mobile.png` (Room-Login im Studio-Rahmen, mobil).

## Nicht belegt

Kein angemeldeter Sprachdialog, keine Unterbrechung, kein Tool-Call, keine oberflächenübergreifende Kontinuität mit realem Nutzer, kein Unreal (Server C offline), kein realer Rollback-Lauf.
