import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentSession, safeNext } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentSession()) redirect(safeNext(next));
  return (
    <main className="auth">
      <AuthForm mode="login" next={next ? safeNext(next) : undefined} />
    </main>
  );
}
