export type TopicKind = "survey" | "question" | "private";
export type SurveyField = { prompt: string; options: string[] };
export type StudioPost = {
  id: string;
  author: string;
  actor: number;
  text: string;
  time: string;
  likes: number[];
};
export type TopicContent = {
  description: string;
  pinned: boolean;
  closed: boolean;
  tags: string[];
  questions: SurveyField[];
  ballots: Record<string, number[]>;
  posts: StudioPost[];
  accepted: string | null;
  followers: number[];
};
export type StudioTopic = {
  id: number;
  kind: TopicKind;
  roomId: number;
  author: string;
  title: string;
  members: number[];
  content: TopicContent;
  updatedAt: string;
};
export type DirectoryAgent = {
  id: number;
  name: string;
  model: string | null;
  provider?: string | null;
  instructions?: string;
};
export type StudioBoard = {
  topics: StudioTopic[];
  agents: DirectoryAgent[];
  actor: number;
};
export type VideoInfo = {
  mime?: string;
  name: string;
  duration: number;
  times: number[];
  caption: string;
};
