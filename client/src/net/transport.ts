/**
 * Client transport interface. The rest of the client (netClient helpers,
 * useNetwork) only touches this shape, never a concrete socket type — so the
 * transport can change without gameplay code changing. The live implementation
 * is `netClient.ts` (a browser `WebSocket`, chosen so the server can be hosted
 * on free platforms that don't expose raw UDP, unlike the original geckos.io
 * UDP-over-WebRTC transport).
 */
export interface NetClientChannel {
  /** Server-assigned connection id — set once the connection is ready (before connectToServer resolves). */
  id: string | undefined;
  /** Register the handler for an inbound event. */
  on(event: string, handler: (data: unknown) => void): void;
  /** Send an event to the server. */
  emit(event: string, data?: unknown): void;
  /** Close the connection. */
  close(): void;
}
