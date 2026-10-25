export type Entity = {
  id: string;
  ownerUserId: string;
  kind: string;
  name: string;
  description: string;
  occurredAt: string | null;
  attributes: Record<string, string>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type User = {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EntityLink = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationship: string;
  createdAt: string;
};

export type EntityWebLink = {
  id: string;
  entityId: string;
  label: string;
  url: string;
  createdAt: string;
};

