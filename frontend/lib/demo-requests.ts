export type DemoRequest = {
  protocol: string;
  userId: string;
  itemId: string;
  quantity: number;
  createdAt: string;
};

const demoStore = globalThis as typeof globalThis & {
  marconRequests?: Map<string, DemoRequest>;
};

export const demoRequests = (demoStore.marconRequests ??= new Map<
  string,
  DemoRequest
>());
