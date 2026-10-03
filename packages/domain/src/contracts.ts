export type UUID=string;
export type AccountScope=Readonly<{userId:UUID;workspaceId:UUID}>;
export type SaveState='local-writing'|'local-saved'|'syncing'|'synced'|'conflict'|'local-error'|'auth-required';
