export type ChatMeta = {
  reactions?: Record<string, string[]>;
  poll?: {
    question: string;
    options: string[];
    votes: Record<string, number>;
    closed: boolean;
  };
  checklist?: { id: number; text: string; done: boolean }[];
  labels?: string[];
  urgent?: boolean;
  stars?: string[];
  followup?: boolean;
  attachments?: {
    assetId: string;
    name: string;
    type: "Image" | "Model" | "Audio";
  }[];
  history?: { text: string; at: string }[];
  forwardedFrom?: { roomId: number; messageId: number; agent: string };
};
export type ChatFilters = {
  kind: string;
  tag: string;
  since: string;
  until: string;
  urgent: boolean;
  starred: boolean;
  followup: boolean;
  thread: string;
  id: string;
};
export const EMPTY_FILTERS: ChatFilters = {
  kind: "",
  tag: "",
  since: "",
  until: "",
  urgent: false,
  starred: false,
  followup: false,
  thread: "",
  id: "",
};
