# Staff/Auth Verification Checklist

## API / DB Preconditions
- You are logged in as an admin.
- You have at least one organization selected.

## Verification Steps (UI)
1. Create User
   - Staff -> Add user (new email).
   - Set a 6-digit PIN.
   - Expect success.

2. Invite Existing Employee
   - Staff -> Add user with an email that already exists in Supabase Auth.
   - PIN input is disabled and shows "Invite sent".
   - Expect pending invite in Staff list.

3. Accept Invite
   - Login as the invited employee.
   - Go to /restaurants and accept the invitation.
   - Expect the new restaurant to show as active.

4. Reset PIN
   - Staff -> Edit user -> Set new PIN (6 digits).
   - Expect "PIN updated" and login works with the new PIN.

5. Delete User (Org-scoped)
   - Staff -> Delete the user.
   - Expect deletion succeeds; no "invalid uuid" errors.

6. Change Email (Admin)
   - Staff -> Edit user email.
   - Expect success if email is not already used within this restaurant.

7. Invitations (API)
   - Ensure invitations list shows pending invites for the org.

## PowerShell Commands (Invoke-RestMethod)
```powershell
# Whoami (dev-only)
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/debug-whoami" -Headers @{}

# Debug auth by email (dev-only)
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/debug-auth-by-email?email=someone@example.com" -Headers @{}

# Set org PIN (admin, requires cookies/session)
$body = @{ userId = "USER_UUID"; organizationId = "ORG_UUID"; pinCode = "123456" } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/admin/set-passcode" -ContentType "application/json" -Body $body
```

## PIN Recovery (Supabase Auth)
- Ensure Supabase Auth Redirect URLs include `/reset-passcode` for localhost and production.
- Steps:
  1. On `/login`, click **Forgot PIN?** and submit the employee email.
  2. Open the recovery email link (should land on `/reset-passcode`).
  3. Enter a new **6-digit** PIN and submit.
  4. Return to `/login` and sign in with the new PIN.
