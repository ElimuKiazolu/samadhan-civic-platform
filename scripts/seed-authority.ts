/**
 * Seed a DEMO AUTHORITY login (email/password) — so a judge can sign in as an
 * authority without a real Google account. Admin-only, run with the service
 * account. One command produces a ready-to-use authority credential.
 *
 *   npx tsx scripts/seed-authority.ts <email> <password> <departmentId>
 *     departmentId ∈ bandhkam | lighting | water | swm | drainage | tp
 *
 * It (a) creates the Firebase Auth user (email/password) if absent, (b) sets the
 * { role:'authority', departmentId } custom claim, (c) mirrors to users/{uid}.
 *
 * For authorities who use a real Google account instead, use
 * scripts/set-authority-claim.ts (claim-only, no password).
 */
import 'dotenv/config';
import { getAuth } from 'firebase-admin/auth';
import { dbService } from '../src/services/db'; // importing initializes firebase-admin

const DEPARTMENTS = ['bandhkam', 'lighting', 'water', 'swm', 'drainage', 'tp'];

async function main() {
  const [email, password, departmentId] = process.argv.slice(2);
  if (!email || !password || !departmentId) {
    console.error('Usage: npx tsx scripts/seed-authority.ts <email> <password> <departmentId>');
    console.error(`  departmentId ∈ ${DEPARTMENTS.join(' | ')}`);
    process.exit(1);
  }
  if (!DEPARTMENTS.includes(departmentId)) {
    console.error(`Unknown departmentId "${departmentId}". Expected one of: ${DEPARTMENTS.join(', ')}`);
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters (Firebase requirement).');
    process.exit(1);
  }

  let user;
  let created = false;
  try {
    user = await getAuth().getUserByEmail(email);
    console.log(`• User ${email} already exists (uid ${user.uid}) — keeping existing password, updating role.`);
  } catch {
    user = await getAuth().createUser({
      email,
      password,
      emailVerified: true,
      displayName: `RMC ${departmentId.toUpperCase()} (demo authority)`,
    });
    created = true;
    console.log(`• Created Firebase Auth user ${email} (uid ${user.uid}).`);
  }

  await getAuth().setCustomUserClaims(user.uid, { role: 'authority', departmentId });
  await dbService.setUserRole(user.uid, 'authority', departmentId);
  await getAuth().revokeRefreshTokens(user.uid);

  console.log('\n┌─ DEMO AUTHORITY LOGIN ───────────────────────────────');
  console.log(`│  email:        ${email}`);
  console.log(`│  password:     ${created ? password : '(unchanged — existing account)'}`);
  console.log(`│  role:         authority`);
  console.log(`│  departmentId: ${departmentId}`);
  console.log('└──────────────────────────────────────────────────────');
  console.log('Sign in via the app\'s "Sign in" → email/password. The authority dashboard appears on next sign-in.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Failed to seed authority:', e);
  process.exit(1);
});
