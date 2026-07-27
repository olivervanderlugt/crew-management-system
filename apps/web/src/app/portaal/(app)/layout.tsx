import { requirePortalCrew } from "@/lib/portal/session";
import { PortalNav } from "@/components/portal/PortalNav";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { crew } = await requirePortalCrew();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-background shadow-sm">
      <PortalNav name={`${crew.first_name} ${crew.last_name}`} />
      <main className="flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
