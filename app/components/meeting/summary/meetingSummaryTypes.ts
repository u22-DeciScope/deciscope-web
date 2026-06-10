export type MeetingPriority = "high" | "medium" | "low";

export type MeetingDecisionSummary = {
  id: number;
  text: string;
  votes: string;
  level: MeetingPriority;
};

export type MeetingActionSummary = {
  id: number;
  text: string;
  owner: string;
  due: string;
  done: boolean;
  priority: MeetingPriority;
};

export type MeetingParticipantSummary = {
  name: string;
  role: string;
  avatar: string;
};

export type MeetingSummaryViewModel = {
  title: string;
  statusLabel: string;
  dateRange: string;
  duration: string;
  aiSummary: string;
  decisions: MeetingDecisionSummary[];
  actions: MeetingActionSummary[];
  participants: MeetingParticipantSummary[];
};
