import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Barcode Generator
          </Link>
          <Link
            href="/designer"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Label Designer
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{user.email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
