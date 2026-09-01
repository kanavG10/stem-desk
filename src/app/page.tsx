import { Dashboard } from "@/components/Dashboard";
import { PageHeader } from "@/components/PageHeader";

export default function Home() {
  const pretty = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <>
      <PageHeader label={pretty} title="Today" />
      <Dashboard />
    </>
  );
}
