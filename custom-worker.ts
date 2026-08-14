// OpenNext generates this module before Wrangler bundles the custom entrypoint.
// @ts-expect-error The generated worker has no source-time declaration file.
import nextWorker from "./.open-next/worker.js";

interface BookingWorkerEnv {
  readonly CRON_SHARED_SECRET?: string;
}

interface BookingWorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const worker = {
  fetch: nextWorker.fetch,

  scheduled(
    _controller: unknown,
    env: BookingWorkerEnv,
    context: BookingWorkerExecutionContext,
  ): void {
    context.waitUntil(runBookingWorkflow(env, context));
  },
};

export default worker;

async function runBookingWorkflow(
  env: BookingWorkerEnv,
  context: BookingWorkerExecutionContext,
): Promise<void> {
  if (!env.CRON_SHARED_SECRET) {
    throw new Error("CRON_CONFIG_MISSING");
  }

  const response = await nextWorker.fetch(
    new Request("https://bmp-booking.internal/api/cron/booking-workflows", {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SHARED_SECRET}` },
    }),
    env,
    context,
  );
  if (!response.ok) {
    throw new Error(`BOOKING_WORKFLOW_HTTP_${response.status}`);
  }
}
