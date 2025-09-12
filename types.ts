
export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  sources?: GroundingSource[];
}
