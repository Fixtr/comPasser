'use strict';

const admin = require('firebase-admin');

const retiredFields = ['phoneNumber', 'isVerified'];

function parseArgs(args) {
  const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const projectId = value('--project');
  const apply = args.includes('--apply');
  const confirmedProject = value('--confirm-project');
  if (!projectId) throw new Error('Pass --project=<firebase-project-id>.');
  if (apply && confirmedProject !== projectId) {
    throw new Error('Applying requires --confirm-project=<same-project-id>.');
  }
  return { projectId, apply };
}

async function cleanupLegacyProfileData(db, { apply = false } = {}) {
  let matched = 0;
  let updated = 0;
  let batch = db.batch();
  let pending = 0;

  for await (const snapshot of db.collection('users').select(...retiredFields).stream()) {
    const data = snapshot.data();
    if (!retiredFields.some(field => Object.hasOwn(data, field))) continue;
    matched += 1;
    if (!apply) continue;

    batch.update(snapshot.ref, Object.fromEntries(retiredFields.map(field => [field, admin.firestore.FieldValue.delete()])));
    pending += 1;
    if (pending === 400) {
      await batch.commit();
      updated += pending;
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) {
    await batch.commit();
    updated += pending;
  }
  return { matched, updated };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  admin.initializeApp({ projectId: options.projectId, credential: admin.credential.applicationDefault() });
  const result = await cleanupLegacyProfileData(admin.firestore(), options);
  console.log(JSON.stringify({ projectId: options.projectId, mode: options.apply ? 'apply' : 'dry-run', ...result }));
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { cleanupLegacyProfileData, parseArgs };
