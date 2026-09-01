import { PageHeader } from "@/components/PageHeader";
import { TodoList } from "@/components/TodoList";

export default function TodosPage() {
  return (
    <>
      <PageHeader label="Desk work" title="To-dos" />
      <TodoList />
    </>
  );
}
