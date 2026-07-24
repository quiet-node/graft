import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

// George, ElevenLabs stock voice
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

const NARRATION_MD = join(__dirname, '..', 'docs', 'narration.md');
const OUTPUT_MP3 = join(__dirname, '..', 'docs', 'assets', 'narration-george.mp3');
const HEADING = '## Continuous script for text to speech';

function extractScript(markdown: string): string {
  const idx = markdown.indexOf(HEADING);
  if (idx === -1) {
    throw new Error(`Heading "${HEADING}" not found in ${NARRATION_MD}`);
  }
  const afterHeading = markdown.slice(idx + HEADING.length);
  const headingLineEnd = afterHeading.indexOf('\n');
  const body = headingLineEnd === -1 ? '' : afterHeading.slice(headingLineEnd + 1);
  return body.trim().replace(/```/g, '').trim();
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('Missing required environment variable: ELEVENLABS_API_KEY');
    process.exit(1);
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const markdown = readFileSync(NARRATION_MD, 'utf-8');
  const text = extractScript(markdown);

  console.log(`Script character count: ${text.length}`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  console.log(`HTTP status: ${response.status}`);

  if (!response.ok) {
    const body = await response.text();
    console.error(`ElevenLabs request failed with status ${response.status}`);
    console.error(body);
    process.exit(1);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(OUTPUT_MP3), { recursive: true });
  writeFileSync(OUTPUT_MP3, bytes);

  console.log(`Bytes written: ${bytes.length}`);
  console.log(`Wrote ${OUTPUT_MP3}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
