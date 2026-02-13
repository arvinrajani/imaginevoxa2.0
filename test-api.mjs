// Quick test: hit the post-options API
const body = JSON.stringify({
  prompt: "Why AI is the future",
  count: 2,
  solutionMode: true,
});

console.log("Testing /api/pro/post-options ...");
try {
  const res = await fetch("http://localhost:3000/api/pro/post-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text.substring(0, 2000));
} catch (err) {
  console.error("Fetch error:", err.message);
}
