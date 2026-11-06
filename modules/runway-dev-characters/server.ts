/**
 * Minimal Express server for the Runway Characters demo.
 * Provenance and status: see MODULE.md (DRAFT, not reviewed).
 */
import RunwayML from '@runwayml/sdk';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createSession, resolveAvatar, SessionError, PRESET_AVATARS } from './src/session.ts';

const port = Number(process.env.PORT ?? 3000);
const app = express();
app.use(express.json({ limit: '4kb' }));

// Created lazily so the static page can start without a key; the SDK reads RUNWAYML_API_SECRET.
let runway: RunwayML | undefined;
function client(): RunwayML {
  if (!process.env.RUNWAYML_API_SECRET) {
    throw new SessionError('RUNWAYML_API_SECRET is not set on the server', 500);
  }
  return (runway ??= new RunwayML());
}

app.get('/api/avatar/config', (_req, res) => {
  res.json({
    customAvatarConfigured: Boolean(process.env.RUNWAY_AVATAR_ID?.trim()),
    presets: PRESET_AVATARS,
    apiKeyConfigured: Boolean(process.env.RUNWAYML_API_SECRET),
  });
});

app.post('/api/avatar/connect', async (req, res) => {
  try {
    const avatar = resolveAvatar(req.body?.presetId, process.env.RUNWAY_AVATAR_ID);
    const credentials = await createSession(client(), avatar);
    res.json(credentials);
  } catch (error) {
    if (error instanceof SessionError) {
      console.error('Session error:', error.message, error.failureCode ?? '');
      res.status(error.httpStatus).json({ error: error.message, failureCode: error.failureCode });
      return;
    }
    // SDK errors may carry request details; log type/status only, never headers.
    const status = (error as { status?: number }).status;
    console.error('Runway API error:', (error as Error).name, status ?? '');
    res.status(502).json({ error: 'Runway API request failed', status });
  }
});

app.use(express.static(fileURLToPath(new URL('./dist', import.meta.url))));

app.listen(port, () => console.log(`Runway Characters demo on http://localhost:${port}`));
