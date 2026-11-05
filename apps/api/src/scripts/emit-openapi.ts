/**
 * Writes docs/openapi.json from the Zod schemas.
 *
 * With --check it writes nothing and exits non-zero if the committed file
 * differs. CI runs that variant, so the published contract can never drift
 * from the code that implements it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '@eo/contracts';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '../../../../docs/openapi.json');

const doc = buildOpenApiDocument();
const next = `${JSON.stringify(doc, null, 2)}\n`;
const check = process.argv.includes('--check');

if (check) {
  if (!fs.existsSync(target)) {
    console.error(`FAIL  docs/openapi.json is missing. Run: npm run openapi`);
    process.exit(1);
  }
  const current = fs.readFileSync(target, 'utf8');
  if (current !== next) {
    console.error(
      'FAIL  docs/openapi.json is out of date with the Zod schemas.\n' +
        '      Run `npm run openapi` and commit the result.',
    );
    process.exit(1);
  }
  const ops = Object.values(doc.paths ?? {}).reduce(
    (n, p) => n + Object.keys(p as object).length,
    0,
  );
  console.log(`OK    openapi.json matches the code (${ops} operations)`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, next);
  const ops = Object.values(doc.paths ?? {}).reduce(
    (n, p) => n + Object.keys(p as object).length,
    0,
  );
  console.log(`wrote docs/openapi.json  (${ops} operations, ${Object.keys(doc.components?.schemas ?? {}).length} schemas)`);
}
