export default async function globalTeardown(): Promise<void> {
  await Promise.all(
    (globalThis.__TEST_CONTAINERS__ ?? []).map((container) => container.stop()),
  );
}
