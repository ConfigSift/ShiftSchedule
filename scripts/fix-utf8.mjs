import fs from 'node:fs/promises';

const DEFAULT_PATH = 'src/components/WeekView.tsx';
const targetPath = process.argv[2] || DEFAULT_PATH;

const utf8StrictDecoder = new TextDecoder('utf-8', { fatal: true });
const utf8LossyDecoder = new TextDecoder('utf-8');

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function countChar(text, ch) {
  let count = 0;
  for (const c of text) {
    if (c === ch) count += 1;
  }
  return count;
}

async function main() {
  const buffer = await fs.readFile(targetPath);
  const hasUtf16LeBom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;

  let method = 'utf8-strict';
  let replacementCount = 0;
  let output = '';

  try {
    output = utf8StrictDecoder.decode(buffer);
  } catch {
    if (hasUtf16LeBom) {
      method = 'utf16le-bom';
      output = buffer.toString('utf16le').replace(/\u0000/g, '');
    } else {
      method = 'utf8-lossy';
      const decoded = utf8LossyDecoder.decode(buffer);
      replacementCount = countChar(decoded, '\uFFFD');
      output = decoded.replace(/\uFFFD/g, '');
    }
  }

  output = stripBom(output);
  await fs.writeFile(targetPath, output, { encoding: 'utf8' });

  console.log(
    `fix-utf8: ${targetPath} -> utf8(no-bom), method=${method}, removedReplacementChars=${replacementCount}`
  );
}

main().catch((error) => {
  console.error(`fix-utf8: failed for ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
