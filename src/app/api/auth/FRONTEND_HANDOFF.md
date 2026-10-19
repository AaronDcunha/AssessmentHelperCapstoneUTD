# Login frontend handoff

The authentication backend is ready. You own the custom login frontend; no database integration is needed to test it locally.

## 1. Set up local authentication

From the project folder, generate your own secret once:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the output in the ignored `.env.local` file:

```dotenv
AUTH_SECRET=paste_generated_value_here
AUTH_DEMO_ENABLED=true
```

Run `npm run dev`. Restart it after changing environment settings. Keep your secret private and reuse it across restarts; changing it invalidates sessions. Demo accounts work only in development.

## 2. Build and connect the form

Create `src/app/(auth)/login/page.tsx` for `/login`. Use a Client Component (`"use client"`) for form state and event handlers. Include username and password inputs, a submit button, loading state, and a generic error message. Use the shared UI components and Figma tokens when available.

Use these imports and submit logic inside your component:

```tsx
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

// Inside the component, alongside username/password/error/loading state:
const router = useRouter();

async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (loading) return;
  setLoading(true);
  setError("");

  try {
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      redirectTo: "/dashboard",
    });

    if (!result || result.error) {
      setError("Invalid username or password");
      return;
    }

    router.push(result.url ?? "/dashboard");
    router.refresh();
  } catch {
    setError("Unable to sign in. Please try again.");
  } finally {
    setLoading(false);
  }
}
```

Attach `handleSubmit` to the form's `onSubmit`. Disable the submit button while loading. Use `type="password"` for the password input and appropriate labels/autocomplete attributes. This snippet assumes your component defines `username`, `password`, `error`, and `loading` state with their setters.

The provider name must be `credentials`, and the credential keys must be `username` and `password`. Auth.js handles CSRF and the session cookie. Do not check passwords in the frontend, store tokens in localStorage, or create another login API.

## 3. Connect the custom page redirects

Once `/login` exists, make these changes together:

- In `src/auth.ts`, add `pages: { signIn: "/login" }` to the NextAuth configuration.
- In `src/server/permissions.ts`, change `requireUser()`'s sign-in redirect to `/login`.
- Change the logout `redirectTo` values in `src/app/(main)/auth-test/page.tsx` and `src/app/(main)/test/[area]/page.tsx` to `/login`.

Keep the successful-login destination `/test` for now. Currently the backend uses Auth.js's built-in page at `/api/auth/signin`; your custom form replaces its presentation and uses the same backend.

## 4. Verify the integration

| Username | Password | Access |
| --- | --- | --- |
| faculty | 123 | Faculty |
| ac | 123 | Faculty + AC |
| admin | 123 | Faculty + AC + Admin |

Unknown usernames, incorrect passwords, and blank credentials must fail. Only the three accounts above are accepted.

- `/auth-test`: identity, effective permissions, role-page links, and logout.
- `/test/faculty`, `/test/ac`, `/test/admin`: Admin-only plain-text previews and logout buttons. All /test pages and /auth-test now require Admin; test APIs still demonstrate the per-role hierarchy.
- `/test`: default login destination, reserved for the component demo; this branch has an empty placeholder.
- `GET /api/me`: `{ id, username, name, roles, permissions }`, or HTTP 401 when logged out. Use this for shared user/navigation data. Server checks independently enforce access; hiding links is not authorization.

Test successful/failed login, loading/error messages, refresh while signed in, denied role-page access, and logout followed by a protected-page visit.

For further backend details, see `docs/reference/AUTH_BACKEND.md`. Real account lookup, password-hash verification, and database permissions remain backend integration work.
