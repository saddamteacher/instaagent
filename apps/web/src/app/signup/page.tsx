import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentSession, safeNext } from "@/lib/session";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentSession()) redirect(safeNext(next));
  return (
    <main className="auth">
      <AuthForm mode="signup" next={next ? safeNext(next) : undefined} />
    </main>
  );
}
