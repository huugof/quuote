const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const apiToken = process.env.API_TOKEN ?? "";

const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${name} :: ${message}`);
    failures.push(`${name}: ${message}`);
  }
}

await check("GET /health", async () => {
  const response = await fetch(new URL("/health", baseUrl));
  if (!response.ok) {
    throw new Error(`expected 200, received ${response.status}`);
  }
});

await check("GET /", async () => {
  const response = await fetch(new URL("/", baseUrl));
  if (!response.ok) {
    throw new Error(`expected 200, received ${response.status}`);
  }
});

await check("GET /feed", async () => {
  const response = await fetch(new URL("/feed", baseUrl));
  if (!response.ok) {
    throw new Error(`expected 200, received ${response.status}`);
  }
});

await check("GET /items", async () => {
  const response = await fetch(new URL("/items?type=quote&limit=5", baseUrl));
  if (!response.ok) {
    throw new Error(`expected 200, received ${response.status}`);
  }
  await response.json();
});

if (apiToken) {
  await check("HEAD /items (auth)", async () => {
    const response = await fetch(new URL("/items", baseUrl), {
      method: "HEAD",
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!response.ok) {
      throw new Error(`expected 200, received ${response.status}`);
    }
  });
}

if (failures.length) {
  console.error(`\nSmoke test failed (${failures.length} issue${failures.length > 1 ? "s" : ""}).`);
  process.exitCode = 1;
} else {
  console.log("\nSmoke test passed.");
}
