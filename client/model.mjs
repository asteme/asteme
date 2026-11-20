/**
 * UI state for the authenticated settings page. Reads cannot overwrite a later write.
 *
 * state.busyKey names the control that started the running write, so the page
 * can show progress on that control alone. state.error.key does the same for a
 * failed write, so the message can sit next to what failed. Both are null for
 * reads. state.notice is a copy key.
 */
export class AstemePageModel {
  constructor(request) {
    this.request = request;
    this.listeners = new Set();
    this.state = { snapshot: null, loading: false, busy: false, busyKey: null, error: null, notice: null };
    this.readGeneration = 0;
    this.disposed = false;
  }
  getSnapshot = () => this.state;
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async refresh(projectId) {
    if (this.state.busy || this.disposed) return;
    const generation = ++this.readGeneration;
    this.publish({ loading: true, error: null, notice: null });
    try {
      const snapshot = await this.request('snapshot', projectId ? { projectId } : {});
      if (generation === this.readGeneration) this.publish({ snapshot, loading: false });
    } catch (error) {
      if (generation === this.readGeneration) this.publish({ loading: false, error: { code: error.code, message: error.message, key: null } });
    }
  }
  /**
   * @param {string} action RPC action name.
   * @param {object} payload RPC payload.
   * @param {{ key?: string, notice?: string }} meta `key` identifies the control
   *   (defaults to the action name); `notice` is the copy key announced on success.
   */
  async perform(action, payload = {}, { key = action, notice = 'saved' } = {}) {
    if (this.state.busy || this.disposed) return false;
    ++this.readGeneration;
    this.publish({ busy: true, busyKey: key, loading: false, error: null, notice: null });
    try {
      const snapshot = await this.request(action, payload);
      this.publish({ snapshot, busy: false, busyKey: null, notice });
      return true;
    } catch (error) {
      this.publish({ busy: false, busyKey: null, error: { code: error.code, message: error.message, key } });
      return false;
    }
  }
  clearNotice() { if (this.state.notice) this.publish({ notice: null }); }
  clearError() { if (this.state.error) this.publish({ error: null }); }
  dispose() { this.disposed = true; this.readGeneration++; this.listeners.clear(); }
}
