/** Three Squares contract; these names are not Worldpay SDK callback names. */
export interface HostedFieldsConfiguration { sessionId: string; identityId: string; mode: 'token' | 'hosted' }
export interface HostedFieldsCallbacks {
  ready(): void;
  validation(message: string | null): void;
  instrumentReady(opaqueHandle: string): void;
  completed(resultHint: unknown): void;
  cancelled(): void;
  error(message: string): void;
}
export interface HostedFieldsBridge {
  mount(container: HTMLElement, configuration: HostedFieldsConfiguration, callbacks: HostedFieldsCallbacks): void;
  submit(): Promise<void>;
  destroy(): void;
}
/** BLOCKED: replace only after the consultant supplies the Express SDK guide. */
export class WorldpayHostedFieldsBridge implements HostedFieldsBridge {
  mount(): never { throw new Error('Worldpay Hosted Fields SDK contract has not been supplied.'); }
  async submit(): Promise<never> { throw new Error('Worldpay Hosted Fields SDK contract has not been supplied.'); }
  destroy(): void { /* No vendor SDK mounted. */ }
}
