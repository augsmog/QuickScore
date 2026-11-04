// Native builds resolve this base module; browser SDK code lives only in analytics.web.ts.
export const webAnalytics = {
  capture(_event: string, _properties?: Record<string, string | number | boolean>): Promise<void> {
    return Promise.resolve();
  },
};
