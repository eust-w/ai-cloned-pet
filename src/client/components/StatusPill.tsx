import type { PetStatus, ReconstructionStatus, ValidationStatus } from "../../shared/types.js";

type Status = PetStatus | ReconstructionStatus | ValidationStatus | "configured" | "missing";

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  return <span className={`status status-${status.replaceAll("_", "-")}`}>{label ?? status.replaceAll("_", " ")}</span>;
}
