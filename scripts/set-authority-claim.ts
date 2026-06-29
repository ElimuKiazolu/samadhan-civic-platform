/**
 * Grant the authority role to a user — run by an admin (Elimu) with the service
 * account. This is the SAFE, out-of-band path: authority is NEVER self-assignable
 * from the app. The target must sign in once first (so a Firebase Auth user
 * exists), then:
 *
 *   tsx scripts/set-authority-claim.ts <email> <departmentId>
 *     departmentId ∈ bandhkam | lighting | water | swm | drainage | tp
 *
 * Sets a custom claim { role:'authority', departmentId } on the token and mirrors
 * it into users/{uid}. The user must sign OUT and back IN (or the app force-
 * refreshes) for the new claim to appear in their token.
 */
import 'dotenv/config';
import { getAuth } from 'firebase-admin/auth';
import { dbService } from '../src/services/db'; // importing initializes firebase-admin

async function main() {
  const [email, departmentId] = process.argv.slice(2);
  if (!email || !departmentId) {
    console.error('Usage: tsx scripts/set-authority-claim.ts <email> <departmentId>');
    console.error('  departmentId ∈ bandhkam | lighting | water | swm | drainage | tp');
    process.exit(1);
  }

  let user;
  try {
    user = await getAuth().getUserByEmail(email);
  } catch (e: any) {
    console.error(`No Firebase Auth user for ${email}. Have them sign in to the app once first.`);
    console.error(`  (${e?.code || e?.message})`);
    process.exit(1);
  }

  await getAuth().setCustomUserClaims(user.uid, { role: 'authority', departmentId });
  await dbService.setUserRole(user.uid, 'authority', departmentId);
  await getAuth().revokeRefreshTokens(user.uid); // ensures the next token carries the claim

  console.log(`✓ Granted authority/${departmentId} to ${email} (uid ${user.uid}).`);
  console.log('  They must sign OUT and back IN (or trigger a token refresh) for it to take effect.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Failed to set authority claim:', e);
  process.exit(1);
});
