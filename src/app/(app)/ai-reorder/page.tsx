
import { ReorderSuggestionForm } from "@/components/ai/ReorderSuggestionForm";

export default function AiReorderPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">AI 重新訂單建議</h1>
      <div className="flex justify-center">
        <ReorderSuggestionForm />
      </div>
    </div>
  );
}
