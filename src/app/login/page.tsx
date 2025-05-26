
// This file is moved to src/app/(auth)/login/page.tsx
// Keeping this placeholder to ensure no broken references if any existed,
// but it should ideally be deleted.
// For now, redirecting to the new location.
import { redirect } from 'next/navigation';

export default function LoginPageRedirect() {
  redirect('/login'); // Next.js will handle the (auth) group path
}
