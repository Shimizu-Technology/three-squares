import type { HostedFieldsBridge, HostedFieldsCallbacks, HostedFieldsConfiguration } from '../hostedFieldsBridge';
/** Fake vendor boundary; emits only the selected collection contract's event. */
export class SimulatedHostedFieldsBridge implements HostedFieldsBridge {
  private configuration?: HostedFieldsConfiguration;
  private callbacks?: HostedFieldsCallbacks;
  private submitting = false;
  private instrument: () => string;
  private execute: () => Promise<unknown>;
  constructor(instrument: () => string, execute: () => Promise<unknown>) { this.instrument = instrument; this.execute = execute; }
  mount(_container: HTMLElement, configuration: HostedFieldsConfiguration, callbacks: HostedFieldsCallbacks) {
    this.configuration = configuration;
    this.callbacks = callbacks;
    callbacks.ready();
  }
  async submit() {
    if (!this.configuration || !this.callbacks) throw new Error('Payment fields are not ready.');
    if (this.submitting) throw new Error('Payment submission is already being checked.');
    this.submitting = true;
    try {
      this.callbacks.validation(null);
      if (this.configuration.mode === 'token') this.callbacks.instrumentReady(this.instrument());
      else this.callbacks.completed(await this.execute());
    } catch (error) {
      this.callbacks.error(error instanceof Error ? error.message : 'Payment status is being checked.');
      throw error;
    } finally { this.submitting = false; }
  }
  destroy() { this.configuration = undefined; this.callbacks = undefined; }
}
