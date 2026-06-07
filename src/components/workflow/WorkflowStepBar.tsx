import { getSteps, getStepIndex } from "@/lib/workflow.config";

interface Props {
  orderType: string | null;
  logisticsStatus: string | null;
}

export function WorkflowStepBar({ orderType, logisticsStatus }: Props) {
  const steps = getSteps(orderType ?? "import");
  const currentIndex = getStepIndex(steps, logisticsStatus);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => {
        let dotClass = "bg-gray-200";
        let textClass = "text-gray-400";

        if (i < currentIndex) {
          dotClass = "bg-emerald-500";
          textClass = "text-emerald-700";
        } else if (i === currentIndex) {
          dotClass = "bg-orange-500";
          textClass = "text-orange-700 font-semibold";
        }

        return (
          <div key={step.key} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full ${dotClass}`} />
            </div>
            <span className={`text-[9px] uppercase ${textClass}`}>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`w-3 h-px ${i < currentIndex ? "bg-emerald-300" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
