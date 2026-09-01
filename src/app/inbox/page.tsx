import { Inbox } from "@/components/Inbox";
import { PageHeader } from "@/components/PageHeader";

export default function InboxPage() {
  return (
    <>
      <PageHeader label="Notifications" title="Inbox" />
      <Inbox />
    </>
  );
}
