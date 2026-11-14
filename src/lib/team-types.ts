export type Participant = { agent: string; role: string; paths: string[]; ready: boolean; done: boolean; control?: "paused" | "stopped" | "removed"; controlRevision?: number };
export type TeamPlan = { expected: number; phase: "planning" | "active" | "done"; revision: number; participants: Participant[] };
export const DEFAULT_TEAM: TeamPlan = { expected: 2, phase: "planning", revision: 1, participants: [] };
