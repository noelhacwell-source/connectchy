import Workspace from "@/components/Workspace";

export const dynamic = "force-dynamic";

export default async function ConnectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Workspace token={token} />;
}
